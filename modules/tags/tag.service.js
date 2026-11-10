/**
 * @file Tag business rules.
 *
 * Tags are the only many-to-many entity, and they apply to both posts and files.
 * Unlike posts and files they carry no data of their own, so there is nothing to
 * validate beyond uniqueness — but they do get one convenience: assigning tags by
 * name creates any tag that does not exist yet, because that is what a person
 * typing into a tag box expects. See SRS.md §6.3.
 *
 * @module modules/tags/tag.service
 */

import * as repo from "./tag.repository.js";
import * as postService from "../posts/post.service.js";
import * as fileService from "../files/file.service.js";
import { db } from "../../db/knex.js";
import {
	buildMeta,
	extractFilters,
	normalisePaging,
	offsetFor,
	parseSort,
	applySearch,
} from "../../utils/query.js";
import { uniqueSlug } from "../../utils/slug.js";
import { resolvePhotoPath, resolveRef, resolveRefs } from "../../utils/refs.js";
import {
	mapSqliteError,
	ConflictError,
	NotFoundError,
} from "../../middleware/errors.js";

/** Columns searched by the free-text `q` parameter. */
const SEARCHABLE = ["name"];

/**
 * Load a tag or raise a 404.
 *
 * @param {number} id
 * @returns {Promise<object>}
 * @throws {NotFoundError}
 */
export async function requireTag(id) {
	const tag = await repo.findById(id);
	if (!tag) throw new NotFoundError(`Tag #${id} does not exist`);
	return tag;
}

/**
 * Paginated, searchable, sortable tag list.
 *
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function list(query) {
	const { page, limit } = normalisePaging(query.page, query.limit);
	const order = parseSort(query.sort, repo.TAG_SORTABLE, "name", "asc");

	const base = db("tags");
	const filters = extractFilters(query);
	if (filters.name) applySearch(base, String(filters.name), ["name"]);
	applySearch(base, /** @type {string} */ (query.q), SEARCHABLE);

	const totalRow = await base.clone().count({ n: "*" }).first();
	const total = Number(totalRow?.n ?? 0);

	const data = await base
		.clone()
		.select(repo.TAG_COLUMNS)
		.orderBy(order.column, order.direction)
		.orderBy("id", "asc")
		.limit(limit)
		.offset(offsetFor(page, limit));

	return {
		data: await withCounts(data),
		meta: buildMeta(page, limit, total),
	};
}

/**
 * Attach `posts_count` and `files_count` to a page of tags.
 *
 * Two grouped queries for the whole page, so the list stays flat no matter how
 * many tags are shown.
 *
 * @param {object[]} rows
 * @returns {Promise<object[]>}
 */
async function withCounts(rows) {
	const ids = rows.map((row) => Number(row.id));
	if (ids.length === 0) return rows;

	const [postCounts, fileCounts] = await Promise.all([
		db("posts_tags")
			.whereIn("tag", ids)
			.groupBy("tag")
			.select("tag")
			.count({ n: "*" }),
		db("files_tags")
			.whereIn("tag", ids)
			.groupBy("tag")
			.select("tag")
			.count({ n: "*" }),
	]);

	const posts = new Map(postCounts.map((row) => [Number(row.tag), Number(row.n)]));
	const files = new Map(fileCounts.map((row) => [Number(row.tag), Number(row.n)]));

	return rows.map((row) => ({
		...row,
		posts_count: posts.get(Number(row.id)) ?? 0,
		files_count: files.get(Number(row.id)) ?? 0,
	}));
}

/**
 * A tag plus the number of things carrying it.
 *
 * @param {number} id
 * @returns {Promise<object>}
 */
export async function get(id) {
	const tag = await repo.findById(id);
	if (!tag) throw new NotFoundError(`Tag #${id} does not exist`);

	const [posts, files] = await Promise.all([
		repo.countPosts(id),
		repo.countFiles(id),
	]);

	return { ...tag, counts: { posts, files } };
}

/**
 * Paginated posts carrying a tag.
 *
 * @param {number} id
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function listPosts(id, query) {
	await requireTag(id);
	return postService.listByTag(id, query);
}

/**
 * Paginated files carrying a tag.
 *
 * @param {number} id
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function listFiles(id, query) {
	await requireTag(id);
	return fileService.listByTag(id, query);
}

/**
 * Every tag, ordered by name. Used to populate picker options.
 *
 * @returns {Promise<object[]>}
 */
export async function options() {
	return repo.findAll();
}

/**
 * Create a tag.
 *
 * @param {object} input - Validated by `createTagSchema`.
 * @returns {Promise<object>}
 */
export async function create(input) {
	const name = String(input.name).trim();

	const clash = await repo.findByName(name);
	if (clash) throw new ConflictError(`A tag named "${name}" already exists`);

	const slug = await uniqueSlug(name, (candidate) => repo.slugExists(candidate));
	const photo = await resolvePhotoPath(input.photo);

	try {
		const id = await repo.insert({ name, slug, photo });
		return requireTag(id);
	} catch (err) {
		throw mapSqliteError(err, "tag");
	}
}

/**
 * Update a tag. Renaming re-derives the slug.
 *
 * @param {number} id
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function update(id, input) {
	const current = await requireTag(id);

	/** @type {Record<string, unknown>} */
	const patch = {};

	// Built as a patch rather than returned early, so a photo-only update is not
	// swallowed by the "name did not change" shortcut.
	if (input.name !== undefined && input.name !== null) {
		const name = String(input.name).trim();
		const clash = await repo.findByName(name);
		if (clash && Number(clash.id) !== Number(id)) {
			throw new ConflictError(`A tag named "${name}" already exists`);
		}
		if (name !== current.name) {
			patch.name = name;
			patch.slug = await uniqueSlug(name, (candidate) => repo.slugExists(candidate, id));
		}
	}

	if (input.photo !== undefined) {
		patch.photo = await resolvePhotoPath(input.photo);
	}

	if (Object.keys(patch).length === 0) return current;

	try {
		await repo.update(id, patch);
	} catch (err) {
		throw mapSqliteError(err, "tag");
	}

	return get(id);
}

/**
 * Delete a tag. Its assignments are removed with it.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function remove(id) {
	await requireTag(id);

	try {
		await repo.remove(id);
	} catch (err) {
		throw mapSqliteError(err, "tag");
	}
}

/**
 * The tags on a post. Read-only — safe to call from a `GET`.
 *
 * @param {number} postId
 * @returns {Promise<object[]>}
 */
export async function forPost(postId) {
	await requirePostExists(postId);
	return repo.listForPost(postId);
}

/**
 * The tags on a file. Read-only — safe to call from a `GET`.
 *
 * @param {number} fileId
 * @returns {Promise<object[]>}
 */
export async function forFile(fileId) {
	await requireFileExists(fileId);
	return repo.listForFile(fileId);
}

/**
 * Add one tag to a post, leaving its existing tags in place.
 *
 * @param {number} postId
 * @param {number} tagId
 * @returns {Promise<object[]>} The post's resulting tags.
 */
export async function addToPost(postId, tagId) {
	await requirePostExists(postId);
	await requireTag(tagId);

	const existing = await db("posts_tags")
		.where({ post: postId, tag: Number(tagId) })
		.first("id");
	if (!existing) {
		await db("posts_tags").insert({ post: postId, tag: Number(tagId) });
	}

	return repo.listForPost(postId);
}

/**
 * Add one tag to a file, leaving its existing tags in place.
 *
 * @param {number} fileId
 * @param {number} tagId
 * @returns {Promise<object[]>}
 */
export async function addToFile(fileId, tagId) {
	await requireFileExists(fileId);
	await requireTag(tagId);

	const existing = await db("files_tags")
		.where({ file: fileId, tag: Number(tagId) })
		.first("id");
	if (!existing) {
		await db("files_tags").insert({ file: fileId, tag: Number(tagId) });
	}

	return repo.listForFile(fileId);
}

/**
 * Replace a post's tags.
 *
 * @param {number} postId
 * @param {unknown} submitted - Names or ids from a picker.
 * @returns {Promise<object[]>} The tags now on the post.
 */
export async function assignToPost(postId, submitted) {
	await requirePostExists(postId);

	const ids = await resolveTagInputs(submitted);
	await repo.replaceForPost(postId, ids);
	return ids.length ? repo.listForPost(postId) : [];
}

/**
 * Replace a file's tags.
 *
 * @param {number} fileId
 * @param {unknown} submitted
 * @returns {Promise<object[]>}
 */
export async function assignToFile(fileId, submitted) {
	await requireFileExists(fileId);

	const ids = await resolveTagInputs(submitted);
	await repo.replaceForFile(fileId, ids);
	return ids.length ? repo.listForFile(fileId) : [];
}

/**
 * Remove one tag from a post, leaving its other tags in place.
 *
 * @param {number} postId
 * @param {number} tagId
 * @returns {Promise<object[]>} The tag's remaining posts' tag list.
 */
export async function removeFromPost(postId, tagId) {
	await requirePostExists(postId);
	await db("posts_tags").where({ post: postId, tag: Number(tagId) }).delete();
	return repo.listForPost(postId);
}

/**
 * Remove one tag from a file, leaving its other tags in place.
 *
 * @param {number} fileId
 * @param {number} tagId
 * @returns {Promise<object[]>}
 */
export async function removeFromFile(fileId, tagId) {
	await requireFileExists(fileId);
	await db("files_tags").where({ file: fileId, tag: Number(tagId) }).delete();
	return repo.listForFile(fileId);
}

/**
 * Confirm a post exists before changing its tag set.
 *
 * @param {number} postId
 * @returns {Promise<void>}
 */
async function requirePostExists(postId) {
	const row = await db("posts").where({ id: postId }).first("id");
	if (!row) throw new NotFoundError(`Post #${postId} does not exist`);
}

/**
 * Confirm a file exists before changing its tag set.
 *
 * @param {number} fileId
 * @returns {Promise<void>}
 */
async function requireFileExists(fileId) {
	const row = await db("files").where({ id: fileId }).first("id");
	if (!row) throw new NotFoundError(`File #${fileId} does not exist`);
}

/**
 * Turn submitted tag references into ids, creating tags that do not exist.
 *
 * Resolution first tries the strict resolver so an id or an exact existing name
 * is unambiguous; whatever is left over is a *new* tag name and is created. A
 * typo therefore produces a new tag rather than a 422, which is the behaviour a
 * tag box should have.
 *
 * @param {unknown} submitted
 * @returns {Promise<number[]>}
 */
async function resolveTagInputs(submitted) {
	const raw = toRawNames(submitted);
	if (raw.length === 0) return [];

	/** @type {Set<number>} */
	const ids = new Set();

	for (const value of raw) {
		ids.add(await resolveOrCreateTag(value));
	}

	return [...ids];
}

/**
 * Resolve one submitted tag reference, creating the tag when it is new.
 *
 * Shared by the multi-tag edit field and the single "add a tag" form so that the
 * same box behaves the same way on both routes: an exact id or existing name wins,
 * anything else is a new tag.
 *
 * @param {unknown} value
 * @returns {Promise<number>}
 */
export async function resolveOrCreateTag(value) {
	let id = null;
	try {
		id = await resolveRef("tags", value);
	} catch {
		id = null;
	}

	if (id !== null) return id;

	// Not an existing tag: create it, reusing a case-insensitive match if the
	// strict resolver rejected it only because it was ambiguous.
	const existing = await repo.findByName(String(value).trim());
	if (existing) return Number(existing.id);

	const name = String(value).trim();
	const slug = await uniqueSlug(name, (candidate) => repo.slugExists(candidate));
	return repo.insert({ name, slug });
}

/**
 * Flatten a submitted tag collection into distinct, trimmed names.
 *
 * @param {unknown} submitted
 * @returns {string[]}
 */
function toRawNames(submitted) {
	const values = Array.isArray(submitted) ? submitted : [submitted];
	/** @type {string[]} */
	const out = [];

	for (const entry of values) {
		if (entry === undefined || entry === null) continue;
		const record = /** @type {Record<string, unknown>} */ (
			typeof entry === "object" ? entry : { value: entry }
		);
		const raw = record.id ?? record.name ?? record.value ?? record;
		for (const part of String(raw).split(",")) {
			const trimmed = part.trim();
			if (trimmed && !out.includes(trimmed)) out.push(trimmed);
		}
	}

	return out;
}
