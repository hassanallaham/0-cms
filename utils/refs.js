/**
 * @file Resolving human input into foreign-key ids.
 *
 * The interface never asks anyone to remember an id. A relation is chosen by
 * typing a name, and the browser sends back whatever the picker captured — an
 * id when JavaScript is available, plain text when it is not. This module turns
 * either shape into a validated id (or a clean validation error).
 *
 * @module utils/refs
 */

import { db } from "../db/knex.js";
import { ValidationError } from "../middleware/errors.js";
import { escapeLike } from "./helpers.js";

/**
 * @typedef {object} RefEntity
 * @property {string} table - Table backing the entity.
 * @property {string} label - Human-readable column shown in pickers.
 * @property {string} searchColumns - Columns a free-text term may match.
 * @property {string} order - Default ordering for suggestions.
 * @property {string} noun - Singular noun used in error messages.
 */

/**
 * @type {Readonly<Record<string, RefEntity>>}
 */
export const REF_ENTITIES = Object.freeze({
	categories: {
		table: "categories",
		label: "name",
		searchColumns: ["name"],
		order: "name",
		noun: "category",
	},
	tags: {
		table: "tags",
		label: "name",
		searchColumns: ["name"],
		order: "name",
		noun: "tag",
	},
	types: {
		table: "types",
		label: "name",
		searchColumns: ["name"],
		order: "name",
		noun: "type",
	},
	posts: {
		table: "posts",
		label: "title",
		searchColumns: ["title"],
		order: "title",
		noun: "post",
	},
	files: {
		table: "files",
		label: "original_name",
		searchColumns: ["original_name", "path"],
		order: "original_name",
		noun: "file",
	},
});

/**
 * Look up an entity definition.
 *
 * @param {string} entity
 * @returns {RefEntity}
 * @throws {ValidationError} When the entity is not referenceable.
 */
export function refEntity(entity) {
	const found = REF_ENTITIES[entity];
	if (!found) {
		throw new ValidationError(
			`Unknown reference type "${entity}"`,
			[{ field: entity, message: "Not a referenceable type" }],
		);
	}
	return found;
}

/**
 * Coerce a value that may arrive as a scalar, a repeated query key, a JSON-ish
 * bracket list, or a comma-separated string into a flat list of raw strings.
 *
 * Handles every shape an HTML form can produce for a multi-value control:
 * `tags=1&tags=2`, `tags[]=1&tags[]=2`, and `tags=1,2`.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function toRawList(value) {
	if (value === undefined || value === null || value === "") return [];
	const values = Array.isArray(value) ? value : [value];
	/** @type {string[]} */
	const out = [];
	for (const entry of values) {
		if (entry === undefined || entry === null) continue;
		for (const part of String(entry).split(",")) {
			const trimmed = part.trim();
			if (trimmed) out.push(trimmed);
		}
	}
	return out;
}

/**
 * Parse a raw string as a positive integer id.
 *
 * @param {string} value
 * @returns {number|null} `null` when the value is not an integer id.
 */
function asId(value) {
	const text = String(value ?? "").trim();
	if (!/^\d+$/.test(text)) return null;
	const id = Number(text);
	return id > 0 ? id : null;
}

/**
 * Confirm a row exists and is not excluded.
 *
 * @param {string} entity
 * @param {number} id
 * @param {number|undefined} exclude - Id that must not resolve (e.g. the row being edited).
 * @returns {Promise<object|undefined>} The row, or `undefined` when unusable.
 */
async function findExisting(entity, id, exclude) {
	const def = refEntity(entity);
	const row = await db(def.table).where({ id }).first("id", def.label);
	if (!row) return undefined;
	if (exclude !== undefined && Number(row.id) === Number(exclude)) return undefined;
	return row;
}

/**
 * Resolve one human-supplied reference to an id.
 *
 * Resolution order:
 *   1. the value parses as an integer id and that row exists;
 *   2. an exact (case-insensitive) match on the label column;
 *   3. a unique `LIKE` prefix match, so "art" can find "Articles".
 *
 * Blank input resolves to `null` — "no relation" is always valid.
 *
 * @param {string} entity - Key of {@link REF_ENTITIES}.
 * @param {unknown} input - Id, name, or an object carrying either.
 * @param {{ exclude?: number, field?: string }} [options]
 * @returns {Promise<number|null>}
 * @throws {ValidationError} When nothing matches, or the match is ambiguous.
 */
export async function resolveRef(entity, input, options = {}) {
	const def = refEntity(entity);
	const field = options.field ?? def.noun;

	const raw = pickRaw(input);
	if (raw === null) return null;
	if (raw === "") return null;

	const asNumericId = asId(raw);
	if (asNumericId !== null) {
		const row = await findExisting(entity, asNumericId, options.exclude);
		if (row) return Number(row.id);
		// A bare number that matches nothing may still be a literal label
		// (a year, a version). Fall through to the text lookups.
	}

	const exact = await db(def.table)
		.whereRaw("lower(??) = lower(?)", [def.label, raw])
		.first("id");
	if (exact) {
		if (options.exclude !== undefined && Number(exact.id) === Number(options.exclude)) {
			return null;
		}
		return Number(exact.id);
	}

	const pattern = `%${escapeLike(raw)}%`;
	const matches = await db(def.table)
		.where((nested) => {
			for (const column of def.searchColumns) {
				nested.orWhere(column, "like", pattern);
			}
		})
		.limit(2);

	if (matches.length === 1) return Number(matches[0].id);

	if (matches.length > 1) {
		throw new ValidationError(`More than one ${def.noun} matches "${raw}"`, [
			{ field, message: `Be more specific — "${raw}" matches several ${def.noun}s` },
		]);
	}

	throw new ValidationError(`Unknown ${def.noun}: "${raw}"`, [
		{ field, message: `No ${def.noun} named "${raw}"` },
	]);
}

/**
 * Resolve a photo reference to the path stored in a `photo` column.
 *
 * The `photo` column on posts, categories and tags holds the blob's path rather
 * than the file's id (SRS §7.2), so a form that submits a file id has to be
 * translated here. Blank input resolves to `null`; an absent field resolves to
 * `undefined`, which means "leave it alone".
 *
 * @param {unknown} input - Id, name, or an object carrying either.
 * @param {{ field?: string }} [options]
 * @returns {Promise<string|null|undefined>}
 * @throws {ValidationError} When the reference does not match a stored file.
 */
export async function resolvePhotoPath(input, options = {}) {
	if (input === undefined) return undefined;

	const fileId = await resolveRef("files", input, { field: options.field ?? "photo" });
	if (fileId === null) return null;

	const file = await db("files").where({ id: fileId }).first("path");
	if (!file) {
		throw new ValidationError("That file does not exist", [
			{ field: options.field ?? "photo", message: "Choose a file that has been uploaded" },
		]);
	}
	return file.path;
}

/**
 * Flatten any reference shape into a list of raw strings.
 *
 * `{ tags: ["1", "2"] }`, `["1", "2"]`, `["1,2"]` and `"1,2"` all flatten to
 * `["1", "2"]`.
 *
 * @param {unknown} input
 * @returns {string[]}
 */
function flattenRefInput(input) {
	if (Array.isArray(input)) {
		return input.flatMap((entry) => flattenRefInput(entry));
	}
	if (input !== null && typeof input === "object") {
		return toRawList(pickRaw(input));
	}
	return toRawList(input);
}

/**
 * Resolve many references at once, dropping blanks and duplicates.
 *
 * @param {string} entity
 * @param {unknown} input
 * @param {{ exclude?: number, field?: string }} [options]
 * @returns {Promise<number[]>}
 */
export async function resolveRefs(entity, input, options = {}) {
	const ids = [];
	for (const raw of flattenRefInput(input)) {
		const id = await resolveRef(entity, raw, options);
		if (id !== null && !ids.includes(id)) ids.push(id);
	}
	return ids;
}

/**
 * Extract the useful scalar from whatever shape a reference arrived in.
 *
 * Accepts `5`, `"5"`, `{ id: 5 }`, `{ category: 5 }`, `{ category_name: "Art" }`
 * and any object with exactly one meaningful key.
 *
 * @param {unknown} input
 * @returns {string|null}
 */
function pickRaw(input) {
	if (input === undefined || input === null) return null;
	if (typeof input === "number" || typeof input === "string") return String(input);
	if (Array.isArray(input)) return input.length ? pickRaw(input[0]) : null;
	if (typeof input === "object") {
		const record = /** @type {Record<string, unknown>} */ (input);
		for (const key of ["id", "value"]) {
			if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
				return String(record[key]);
			}
		}
		for (const [key, value] of Object.entries(record)) {
			if (value === undefined || value === null || value === "") continue;
			if (key === "entity") continue;
			return String(value);
		}
	}
	return String(input);
}