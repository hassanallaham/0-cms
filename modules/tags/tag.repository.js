/**
 * @file Data access for `tags` and the tables that relate tags to things.
 *
 * @module modules/tags/tag.repository
 */

import { db, utcNow } from "../../db/knex.js";

/** Columns safe to expose in any context. */
export const TAG_COLUMNS = ["id", "name", "slug", "description", "photo", "created_at", "updated_at"];

/** Columns for autocomplete suggestions. */
export const TAG_PICK_COLUMNS = ["id", "name", "slug"];


/** Columns permitted in a `sort` parameter. */
export const TAG_SORTABLE = ["id", "name", "slug", "created_at", "updated_at"];

/**
 * Fetch one tag by id.
 *
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
export function findById(id) {
	return db("tags").where({ id }).first(TAG_COLUMNS);
}

/**
 * Fetch one tag by slug.
 *
 * @param {string} slug
 * @returns {Promise<object|undefined>}
 */
export function findBySlug(slug) {
	return db("tags").where({ slug }).first(TAG_COLUMNS);
}

/**
 * Fetch one tag by exact name (case-insensitive).
 *
 * @param {string} name
 * @returns {Promise<object|undefined>}
 */
export function findByName(name) {
	return db("tags")
		.whereRaw("lower(name) = lower(?)", [name])
		.first("id", "name", "slug");
}

/**
 * True when a slug is already taken.
 *
 * @param {string} slug
 * @param {number} [excludeId]
 * @returns {Promise<boolean>}
 */
export function slugExists(slug, excludeId) {
	const query = db("tags").where({ slug });
	if (excludeId !== undefined) query.whereNot({ id: excludeId });
	return query.first("id").then(Boolean);
}

/**
 * Suggest tags for an autocomplete picker.
 *
 * @param {string} term
 * @param {{ limit?: number }} [options]
 * @returns {Promise<object[]>}
 */
export function suggest(term, { limit = 10 } = {}) {
	const query = db("tags").select(TAG_PICK_COLUMNS);
	if (term) {
		const pattern = `%${term}%`;
		query.where((nested) => {
			nested.where("name", "like", pattern).orWhere("slug", "like", pattern);
		});
	}
	return query.orderBy("name", "asc").limit(limit);
}

/**
 * Insert a tag.
 *
 * @param {object} data
 * @returns {Promise<number>} Id of the new row.
 */
export async function insert(data) {
	const [row] = await db("tags").insert(data).returning("id");
	return Number(typeof row === "object" ? row.id : row);
}

/**
 * Apply a partial update.
 *
 * @param {number} id
 * @param {object} data
 * @returns {Promise<number>} Rows affected.
 */
export function update(id, data) {
	return db("tags")
		.where({ id })
		.update({ ...data, updated_at: utcNow() })
		.then((count) => Number(count));
}

/**
 * Delete a tag. Its join rows go with it via `ON DELETE CASCADE`.
 *
 * @param {number} id
 * @returns {Promise<number>} Rows affected.
 */
export function remove(id) {
	return db("tags")
		.where({ id })
		.delete()
		.then((count) => Number(count));
}

/**
 * Count the posts carrying a tag.
 *
 * @param {number} id
 * @returns {Promise<number>}
 */
export function countPosts(id) {
	return db("posts_tags")
		.where({ tag: id })
		.count({ n: "*" })
		.first()
		.then((row) => Number(row?.n ?? 0));
}

/**
 * Count the files carrying a tag.
 *
 * @param {number} id
 * @returns {Promise<number>}
 */
export function countFiles(id) {
	return db("files_tags")
		.where({ tag: id })
		.count({ n: "*" })
		.first()
		.then((row) => Number(row?.n ?? 0));
}

/**
 * Tags attached to a post, ordered by name.
 *
 * @param {number} postId
 * @returns {Promise<object[]>}
 */
export function listForPost(postId) {
	// `id` stays qualified: `posts_tags` carries its own `id`-less columns but the
	// join would leave bare `id` ambiguous to SQLite.
	return db("tags")
		.join("posts_tags", "posts_tags.tag", "tags.id")
		.where("posts_tags.post", postId)
		.select("tags.id", "tags.name", "tags.slug")
		.orderBy("tags.name", "asc");
}

/**
 * Tags attached to a file, ordered by name.
 *
 * @param {number} fileId
 * @returns {Promise<object[]>}
 */
export function listForFile(fileId) {
	return db("tags")
		.join("files_tags", "files_tags.tag", "tags.id")
		.where("files_tags.file", fileId)
		.select("tags.id", "tags.name", "tags.slug")
		.orderBy("tags.name", "asc");
}

/**
 * Replace a post's tags.
 *
 * @param {number} postId
 * @param {number[]} tagIds
 * @returns {Promise<void>}
 */
export async function replaceForPost(postId, tagIds) {
	await db("posts_tags").where({ post: postId }).delete();
	const rows = [...new Set(tagIds.map(Number))].map((tag) => ({
		post: postId,
		tag,
	}));
	if (rows.length > 0) await db("posts_tags").insert(rows);
}

/**
 * Replace a file's tags.
 *
 * @param {number} fileId
 * @param {number[]} tagIds
 * @returns {Promise<void>}
 */
export async function replaceForFile(fileId, tagIds) {
	await db("files_tags").where({ file: fileId }).delete();
	const rows = [...new Set(tagIds.map(Number))].map((tag) => ({
		file: fileId,
		tag,
	}));
	if (rows.length > 0) await db("files_tags").insert(rows);
}

/**
 * Every tag, ordered by name. Used to populate picker options.
 *
 * @returns {Promise<object[]>}
 */
export function findAll() {
	return db("tags")
		.select(TAG_PICK_COLUMNS)
		.orderBy("name", "asc");
}
