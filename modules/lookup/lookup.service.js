/**
 * @file Shared autocomplete for every pickable entity.
 *
 * The dashboard has five relation pickers — category, type, tags, posts, files —
 * and they all behave identically: type a few characters, get back ids and
 * labels. One endpoint keeps that behaviour consistent and means a new picker
 * never needs new server code.
 *
 * @module modules/lookup/lookup.service
 */

import * as categoryRepo from "../categories/category.repository.js";
import * as tagRepo from "../tags/tag.repository.js";
import * as typeRepo from "../types/type.repository.js";
import * as postRepo from "../posts/post.repository.js";
import * as fileRepo from "../files/file.repository.js";
import { ValidationError } from "../../middleware/errors.js";

/**
 * @typedef {object} LookupSource
 * @property {string} label - Column shown as the suggestion text.
 * @property {string} secondary - Column shown as supporting detail, or `""`.
 * @property {(term: string, options: { limit: number, exclude?: number }) => Promise<object[]>} suggest
 * @property {string} order - Sort column applied after mapping.
 */

/**
 * @type {Readonly<Record<string, LookupSource>>}
 */
const SOURCES = Object.freeze({
	categories: {
		label: "name",
		secondary: "slug",
		suggest: (term, options) => categoryRepo.suggest(term, options),
		order: "name",
	},
	tags: {
		label: "name",
		secondary: "slug",
		suggest: (term, options) => tagRepo.suggest(term, options),
		order: "name",
	},
	types: {
		label: "name",
		secondary: "slug",
		suggest: async (term, { limit }) => {
			const all = await typeRepo.findAll();
			const needle = term.toLowerCase();
			const matching = needle
				? all.filter((row) => String(row.name).toLowerCase().includes(needle))
				: all;
			return matching.slice(0, limit);
		},
		order: "name",
	},
	posts: {
		label: "title",
		secondary: "slug",
		suggest: (term, options) => postRepo.suggest(term, options),
		order: "title",
	},
	files: {
		label: "original_name",
		secondary: "mimetype",
		suggest: (term, options) => fileRepo.suggest(term, options),
		order: "original_name",
	},
});

/**
 * Entities that can be autocompleted.
 * @type {readonly string[]}
 */
export const LOOKUP_ENTITIES = Object.freeze(Object.keys(SOURCES));

/**
 * Suggest entities of one kind.
 *
 * @param {string} entity - One of {@link LOOKUP_ENTITIES}.
 * @param {{ q?: string, limit?: number, exclude?: number }} query
 * @returns {Promise<object[]>} Suggestions shaped for the picker widget.
 * @throws {ValidationError} When `entity` is not autocompletable.
 */
export async function suggest(entity, query) {
	const source = SOURCES[entity];
	if (!source) {
		throw new ValidationError(`Cannot look up "${entity}"`, [
			{
				field: "entity",
				message: `Expected one of: ${LOOKUP_ENTITIES.join(", ")}`,
			},
		]);
	}

	const term = String(query.q ?? "").trim();
	const limit = Math.min(Math.max(Number(query.limit ?? 10) || 10, 1), 25);

	const rows = await source.suggest(term, { limit, exclude: query.exclude });

	return rows
		.map((row) => ({
			id: Number(row.id),
			label: String(row[source.label] ?? ""),
			detail: source.secondary ? String(row[source.secondary] ?? "") : "",
		}))
		.sort((left, right) => left.label.localeCompare(right.label))
		.slice(0, limit);
}
