/**
 * @file Data access for `posts` and the two tables that relate posts to things.
 *
 * Each entity owns the SQL that touches its own table, even when the query was
 * written on behalf of another module — so `listPostsByCategory` living here
 * rather than in the categories repository keeps every `posts` query in one
 * place.
 *
 * @module modules/posts/post.repository
 */

import { db, utcNow } from "../../db/knex.js";

/** Columns safe to expose in a list view. */
export const POST_COLUMNS = [
	"id",
	"status",
	"category",
	"title",
	"slug",
	"type",
	"photo",
	"content",
	"notes",
	"created_at",
	"updated_at",
];

/** Columns for autocomplete suggestions. */
export const POST_PICK_COLUMNS = ["id", "title", "slug"];

/** Columns permitted in a `sort` parameter. */
export const POST_SORTABLE = ["id", "title", "slug", "status", "created_at", "updated_at"];

/**
 * Fetch one post by id.
 *
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
export function findById(id) {
	return db("posts").where({ id }).first(POST_COLUMNS);
}

/**
 * Fetch one post by slug.
 *
 * @param {string} slug
 * @returns {Promise<object|undefined>}
 */
export function findBySlug(slug) {
	return db("posts").where({ slug }).first(POST_COLUMNS);
}

/**
 * Fetch one post by exact title (case-insensitive).
 *
 * @param {string} title
 * @returns {Promise<object|undefined>}
 */
export function findByTitle(title) {
	return db("posts")
		.whereRaw("lower(title) = lower(?)", [title])
		.first("id", "title", "slug");
}

/**
 * True when a slug is already taken.
 *
 * @param {string} slug
 * @param {number} [excludeId] - Post being updated; ignored when matching.
 * @returns {Promise<boolean>}
 */
export function slugExists(slug, excludeId) {
	const query = db("posts").where({ slug });
	if (excludeId !== undefined) query.whereNot({ id: excludeId });
	return query.first("id").then(Boolean);
}

/**
 * Suggest posts for an autocomplete picker.
 *
 * @param {string} term
 * @param {{ limit?: number, exclude?: number }} [options]
 * @returns {Promise<object[]>}
 */
export function suggest(term, { limit = 10, exclude } = {}) {
	const query = db("posts").select(POST_PICK_COLUMNS);
	if (exclude !== undefined) query.whereNot({ id: exclude });
	if (term) query.where("title", "like", `%${term}%`);
	return query.orderBy("title", "asc").limit(limit);
}

/**
 * Insert a post.
 *
 * @param {object} data
 * @returns {Promise<number>} Id of the new row.
 */
export async function insert(data) {
	const [row] = await db("posts").insert(data).returning("id");
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
	return db("posts")
		.where({ id })
		.update({ ...data, updated_at: utcNow() })
		.then((count) => Number(count));
}

/**
 * Delete a post.
 *
 * Join rows are removed by `ON DELETE CASCADE`, so no manual cleanup is needed.
 *
 * @param {number} id
 * @returns {Promise<number>} Rows affected.
 */
export function remove(id) {
	return db("posts")
		.where({ id })
		.delete()
		.then((count) => Number(count));
}

/**
 * Count posts in a given status.
 *
 * @param {string} status
 * @returns {Promise<number>}
 */
export function countByStatus(status) {
	return db("posts")
		.where({ status })
		.count({ n: "*" })
		.first()
		.then((row) => Number(row?.n ?? 0));
}

/**
 * The full set of post ids matching a query, then a page of them.
 *
 * Shared by every filtered list (by category, by tag, by status) so they all
 * paginate identically.
 *
 * Column names are qualified with `posts.` throughout: callers may join a pivot
 * table in, and SQLite rejects a bare `id` as ambiguous once they do.
 *
 * @param {import('knex').Knex.QueryBuilder} base - Query already filtered, not yet ordered.
 * @param {{ order: import('../../utils/query.js').SortOrder, limit: number, offset: number }} paging
 * @returns {Promise<{ ids: number[], total: number }>}
 */
async function pageIds(base, { order, limit, offset }) {
	const totalRow = await base.clone().count({ n: "*" }).first();
	const total = Number(totalRow?.n ?? 0);
	if (total === 0) return { ids: [], total };

	const rows = await base
		.clone()
		.select("posts.id")
		.orderBy(`posts.${order.column}`, order.direction)
		.orderBy("posts.id", "asc")
		.limit(limit)
		.offset(offset);

	return { ids: rows.map((row) => Number(row.id)), total };
}

/**
 * Fetch a page of posts with their content.
 *
 * Knex's SQLite driver does not support ordered `IN`, so the page is selected as
 * ids first and the rows are fetched in a second query, then re-sorted in JS to
 * restore the requested order.
 *
 * @param {import('knex').Knex.QueryBuilder} base
 * @param {{ order: import('../../utils/query.js').SortOrder, limit: number, offset: number }} paging
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function pageRows(base, paging) {
	const { ids, total } = await pageIds(base, paging);
	if (ids.length === 0) return { data: [], total };

	const rows = await db("posts").whereIn("id", ids).select(POST_COLUMNS);
	const byId = new Map(rows.map((row) => [Number(row.id), row]));
	const data = ids.map((id) => byId.get(id)).filter(Boolean);

	return { data, total };
}

/**
 * Paginated posts belonging to a category.
 *
 * @param {number} categoryId
 * @param {{ order: import('../../utils/query.js').SortOrder, limit: number, offset: number }} paging
 * @returns {Promise<{ data: object[], total: number }>}
 */
export function listByCategory(categoryId, paging) {
	return pageRows(db("posts").where({ category: categoryId }), paging);
}

/**
 * Paginated posts carrying a tag.
 *
 * @param {number} tagId
 * @param {{ order: import('../../utils/query.js').SortOrder, limit: number, offset: number }} paging
 * @returns {Promise<{ data: object[], total: number }>}
 */
export function listByTag(tagId, paging) {
	return pageRows(
		db("posts")
			.join("posts_tags", "posts_tags.post", "posts.id")
			.where("posts_tags.tag", tagId),
		paging,
	);
}

/**
 * Ids of the posts linked to a file.
 *
 * @param {number} fileId
 * @returns {Promise<number[]>}
 */
export function idsLinkedToFile(fileId) {
	return db("posts_files")
		.where({ file: fileId })
		.orderBy("id", "asc")
		.pluck("post");
}

/**
 * Ids of the posts this post links *to* — its outbound edges.
 *
 * Outbound and inbound stay separate queries (SRS §8.4): "related" and "pointing
 * here" are distinct lists and must never be merged.
 *
 * @param {number} postId
 * @returns {Promise<number[]>}
 */
export function idsOutbound(postId) {
	return db("posts_posts")
		.where({ from_post: Number(postId) })
		.orderBy("id", "asc")
		.pluck("to_post")
		.then((rows) => rows.map(Number));
}

/**
 * Ids of the posts that link *to* this post — its inbound edges.
 *
 * @param {number} postId
 * @returns {Promise<number[]>}
 */
export function idsInbound(postId) {
	return db("posts_posts")
		.where({ to_post: Number(postId) })
		.orderBy("id", "asc")
		.pluck("from_post")
		.then((rows) => rows.map(Number));
}

/**
 * Ids of the posts linked to a post in either direction.
 *
 * Used for reference counting and delete guards only, never for display.
 *
 * @param {number} postId
 * @returns {Promise<number[]>}
 */
export async function idsLinkedToPost(postId) {
	const [out, inbound] = await Promise.all([idsOutbound(postId), idsInbound(postId)]);
	return [...new Set([...out, ...inbound])];
}

/**
 * Replace a post's outgoing links to other posts.
 *
 * Rows where the post is the *target* are left alone: they belong to the other
 * post's outgoing set.
 *
 * @param {number} postId
 * @param {number[]} targetIds
 * @returns {Promise<void>}
 */
export async function replacePostLinks(postId, targetIds) {
	await db("posts_posts").where({ from_post: postId }).delete();
	const rows = targetIds
		.filter((target) => Number(target) !== Number(postId))
		.map((target) => ({ from_post: postId, to_post: Number(target) }));
	if (rows.length > 0) await db("posts_posts").insert(rows);
}

/**
 * Replace a post's links to files.
 *
 * @param {number} postId
 * @param {number[]} fileIds
 * @returns {Promise<void>}
 */
export async function replaceFileLinks(postId, fileIds) {
	await db("posts_files").where({ post: postId }).delete();
	const rows = fileIds
		.filter((file) => Number(file) > 0)
		.map((file) => ({ post: postId, file: Number(file) }));
	if (rows.length > 0) await db("posts_files").insert(rows);
}
