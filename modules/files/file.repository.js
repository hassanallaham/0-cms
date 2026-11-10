/**
 * @file Data access for `files` and its join tables.
 *
 * @module modules/files/file.repository
 */

import { db, utcNow } from "../../db/knex.js";

/** Columns safe to expose in a list view. */
export const FILE_COLUMNS = [
	"id",
	"category",
	"mimetype",
	"original_name",
	"stored_name",
	"size",
	"path",
	"hash",
	"created_at",
	"updated_at",
];

/** Columns for pickers and relation summaries — no hash, no internal path. */
export const FILE_PICK_COLUMNS = [
	"id",
	"category",
	"mimetype",
	"original_name",
	"stored_name",
	"size",
	"created_at",
];

/** Columns permitted in a `sort` parameter. */
export const FILE_SORTABLE = [
	"id",
	"original_name",
	"mimetype",
	"size",
	"created_at",
	"updated_at",
];

/**
 * Fetch one file by id.
 *
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
export function findById(id) {
	return db("files").where({ id }).first(FILE_COLUMNS);
}

/**
 * Fetch one file by the name it was stored under.
 *
 * @param {string} storedName
 * @returns {Promise<object|undefined>}
 */
export function findByStoredName(storedName) {
	return db("files").where({ stored_name: storedName }).first(FILE_COLUMNS);
}

/**
 * Fetch one file by its stored path.
 *
 * `posts.photo`, `categories.photo` and `tags.photo` hold the path rather than
 * the id (SRS §7.2), so this is how a photo column is resolved back to a row.
 *
 * @param {string} path
 * @returns {Promise<object|undefined>}
 */
export function findByPath(path) {
	return db("files").where({ path }).first(FILE_COLUMNS);
}

/**
 * Look up an existing row by content hash — the basis of upload de-duplication.
 *
 * @param {string} hash
 * @returns {Promise<object|undefined>}
 */
export function findByHash(hash) {
	return db("files").where({ hash }).first(FILE_COLUMNS);
}

/**
 * True when a stored name is taken. Stored names are UUID-based, so a collision
 * is not expected; the check exists to turn an impossible event into a 409.
 *
 * @param {string} storedName
 * @param {number} [excludeId]
 * @returns {Promise<boolean>}
 */
export function storedNameExists(storedName, excludeId) {
	const query = db("files").where({ stored_name: storedName });
	if (excludeId !== undefined) query.whereNot({ id: excludeId });
	return query.first("id").then(Boolean);
}

/**
 * Suggest files for an autocomplete picker.
 *
 * @param {string} term
 * @param {{ limit?: number, exclude?: number }} [options]
 * @returns {Promise<object[]>}
 */
export function suggest(term, { limit = 10, exclude } = {}) {
	const query = db("files").select(FILE_PICK_COLUMNS);
	if (exclude !== undefined) query.whereNot({ id: exclude });
	if (term) {
		const pattern = `%${term}%`;
		query.where((nested) => {
			nested
				.where("original_name", "like", pattern)
				.orWhere("mimetype", "like", pattern);
		});
	}
	return query.orderBy("created_at", "desc").limit(limit);
}

/**
 * Insert a file row.
 *
 * @param {object} data
 * @returns {Promise<number>} Id of the new row.
 */
export async function insert(data) {
	const [row] = await db("files").insert(data).returning("id");
	return Number(typeof row === "object" ? row.id : row);
}

/**
 * Apply a partial update to file metadata.
 *
 * @param {number} id
 * @param {object} data
 * @returns {Promise<number>} Rows affected.
 */
export function update(id, data) {
	return db("files")
		.where({ id })
		.update({ ...data, updated_at: utcNow() })
		.then((count) => Number(count));
}

/**
 * Delete a file row.
 *
 * @param {number} id
 * @returns {Promise<number>} Rows affected.
 */
export function remove(id) {
	return db("files")
		.where({ id })
		.delete()
		.then((count) => Number(count));
}

/**
 * Count files in a given MIME type.
 *
 * @param {string} mimetype
 * @returns {Promise<number>}
 */
export function countByMimetype(mimetype) {
	return db("files")
		.where({ mimetype })
		.count({ n: "*" })
		.first()
		.then((row) => Number(row?.n ?? 0));
}

/**
 * Count the posts that point at a file, in the file's own direction.
 *
 * @param {number} id
 * @returns {Promise<number>}
 */
export function countAttachedPosts(id) {
	return db("posts_files")
		.where({ file: id })
		.count({ n: "*" })
		.first()
		.then((row) => Number(row?.n ?? 0));
}

/**
 * Count the files this file is directly linked to, in both directions.
 *
 * @param {number} id
 * @returns {Promise<number>}
 */
export function countLinkedFiles(id) {
	return db("files_files")
		.where("from_file", id)
		.orWhere("to_file", id)
		.count({ n: "*" })
		.first()
		.then((row) => Number(row?.n ?? 0));
}

/**
 * Count the files carrying a tag.
 *
 * @param {number} tagId
 * @returns {Promise<number>}
 */
export function countByTag(tagId) {
	return db("files_tags")
		.where({ tag: tagId })
		.count({ n: "*" })
		.first()
		.then((row) => Number(row?.n ?? 0));
}

/**
 * Fetch a page of files with their rows.
 *
 * @param {import('knex').Knex.QueryBuilder} base - Query already filtered.
 * @param {import('../../utils/query.js').SortOrder} order
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function pageRows(base, order, limit, offset) {
	const totalRow = await base.clone().count({ n: "*" }).first();
	const total = Number(totalRow?.n ?? 0);
	if (total === 0) return { data: [], total };

	// Qualified because some callers join a pivot table onto `files`.
	const ids = await base
		.clone()
		.select("files.id")
		.orderBy(`files.${order.column}`, order.direction)
		.orderBy("files.id", "asc")
		.limit(limit)
		.offset(offset);

	const idList = ids.map((row) => Number(row.id));
	if (idList.length === 0) return { data: [], total };

	const rows = await db("files").whereIn("id", idList).select(FILE_COLUMNS);
	const byId = new Map(rows.map((row) => [Number(row.id), row]));

	return { data: idList.map((id) => byId.get(id)).filter(Boolean), total };
}

/**
 * Paginated files belonging to a category.
 *
 * @param {number} categoryId
 * @param {{ order: import('../../utils/query.js').SortOrder, limit: number, offset: number }} paging
 * @returns {Promise<{ data: object[], total: number }>}
 */
export function listByCategory(categoryId, paging) {
	return pageRows(
		db("files").where({ category: categoryId }),
		paging.order,
		paging.limit,
		paging.offset,
	);
}

/**
 * Paginated files carrying a tag.
 *
 * @param {number} tagId
 * @param {{ order: import('../../utils/query.js').SortOrder, limit: number, offset: number }} paging
 * @returns {Promise<{ data: object[], total: number }>}
 */
export function listByTag(tagId, paging) {
	return pageRows(
		db("files")
			.join("files_tags", "files_tags.file", "files.id")
			.where("files_tags.tag", tagId)
			.select("files.*"),
		paging.order,
		paging.limit,
		paging.offset,
	);
}

/**
 * Ids of the files this file links *to* — its outbound edges.
 *
 * Outbound and inbound are deliberately separate queries (SRS §8.4): "related"
 * and "pointing here" must never be merged, or a one-way link would show up as
 * if it were mutual.
 *
 * @param {number} fileId
 * @returns {Promise<number[]>}
 */
export function idsOutbound(fileId) {
	return db("files_files")
		.where({ from_file: Number(fileId) })
		.orderBy("id", "asc")
		.pluck("to_file")
		.then((rows) => rows.map(Number));
}

/**
 * Ids of the files that link *to* this file — its inbound edges.
 *
 * @param {number} fileId
 * @returns {Promise<number[]>}
 */
export function idsInbound(fileId) {
	return db("files_files")
		.where({ to_file: Number(fileId) })
		.orderBy("id", "asc")
		.pluck("from_file")
		.then((rows) => rows.map(Number));
}

/**
 * Ids of the files linked to a file in either direction.
 *
 * Only used for reference counting and delete guards, never for display.
 *
 * @param {number} fileId
 * @returns {Promise<number[]>}
 */
export async function idsLinkedToFile(fileId) {
	const [out, inbound] = await Promise.all([idsOutbound(fileId), idsInbound(fileId)]);
	return [...new Set([...out, ...inbound])];
}

/**
 * Replace a file's outgoing links to other files.
 *
 * @param {number} fileId
 * @param {number[]} targetIds
 * @returns {Promise<void>}
 */
export async function replaceFileLinks(fileId, targetIds) {
	await db("files_files").where({ from_file: fileId }).delete();
	const rows = targetIds
		.filter((target) => Number(target) !== Number(fileId))
		.map((target) => ({ from_file: fileId, to_file: Number(target) }));
	if (rows.length > 0) await db("files_files").insert(rows);
}

/**
 * Ids of the posts attached to a file from the *post's* side.
 *
 * This is the complete list of posts that reference a file. A post-to-post edge
 * does not carry a file along, so there is no second, indirect source of posts.
 *
 * @param {number} fileId
 * @returns {Promise<number[]>}
 */
export function postIdsAttached(fileId) {
	return db("posts_files")
		.where({ file: fileId })
		.orderBy("id", "asc")
		.pluck("post");
}
