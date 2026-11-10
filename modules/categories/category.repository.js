/**
 * @file Data access for `categories`.
 *
 * The only place in the app that writes SQL about categories. Every function
 * takes plain values and returns plain rows; nothing here raises an HTTP error
 * or knows a request exists.
 *
 * @module modules/categories/category.repository
 */

import { db, utcNow } from "../../db/knex.js";

/** Columns safe to expose in any context. */
export const CATEGORY_COLUMNS = [
	"id",
	"name",
	"slug",
	"description",
	"mother_category",
	"photo",
	"created_at",
	"updated_at",
];

/** Columns for autocomplete suggestions — the minimum a picker needs. */
export const CATEGORY_PICK_COLUMNS = ["id", "name", "slug"];

/** Columns permitted in a `sort` parameter. */
export const CATEGORY_SORTABLE = ["id", "name", "slug", "created_at", "updated_at"];

/**
 * Fetch one category by id.
 *
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
export function findById(id) {
	return db("categories").where({ id }).first(CATEGORY_COLUMNS);
}

/**
 * Fetch one category by slug.
 *
 * @param {string} slug
 * @returns {Promise<object|undefined>}
 */
export function findBySlug(slug) {
	return db("categories").where({ slug }).first(CATEGORY_COLUMNS);
}

/**
 * Fetch one category by exact name (case-insensitive).
 *
 * @param {string} name
 * @returns {Promise<object|undefined>}
 */
export function findByName(name) {
	return db("categories")
		.whereRaw("lower(name) = lower(?)", [name])
		.first("id", "name", "slug");
}

/**
 * True when a slug is already taken.
 *
 * @param {string} slug
 * @param {number} [excludeId] - Category being updated; ignored when matching.
 * @returns {Promise<boolean>}
 */
export function slugExists(slug, excludeId) {
	const query = db("categories").where({ slug });
	if (excludeId !== undefined) query.whereNot({ id: excludeId });
	return query.first("id").then(Boolean);
}

/**
 * Suggest categories for an autocomplete picker.
 *
 * @param {string} term - Partial name to match.
 * @param {{ limit?: number, exclude?: number }} [options]
 * @returns {Promise<object[]>}
 */
export function suggest(term, { limit = 10, exclude } = {}) {
	const query = db("categories").select(CATEGORY_PICK_COLUMNS);
	if (exclude !== undefined) query.whereNot({ id: exclude });
	if (term) {
		const pattern = `%${term}%`;
		query.where((nested) => {
			nested.where("name", "like", pattern).orWhere("slug", "like", pattern);
		});
	}
	return query.orderBy("name", "asc").limit(limit);
}

/**
 * Insert a category.
 *
 * @param {object} data
 * @returns {Promise<number>} Id of the new row.
 */
export async function insert(data) {
	const [row] = await db("categories").insert(data).returning("id");
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
	return db("categories")
		.where({ id })
		.update({ ...data, updated_at: utcNow() })
		.then((count) => Number(count));
}

/**
 * Delete a category.
 *
 * @param {number} id
 * @returns {Promise<number>} Rows affected.
 */
export function remove(id) {
	return db("categories")
		.where({ id })
		.delete()
		.then((count) => Number(count));
}

/**
 * Count the direct children of a category.
 *
 * @param {number} id
 * @returns {Promise<number>}
 */
export function countChildren(id) {
	return db("categories")
		.where({ mother_category: id })
		.count({ n: "*" })
		.first()
		.then((row) => Number(row?.n ?? 0));
}

/**
 * Count the posts in a category.
 *
 * @param {number} id
 * @returns {Promise<number>}
 */
export function countPosts(id) {
	return db("posts")
		.where({ category: id })
		.count({ n: "*" })
		.first()
		.then((row) => Number(row?.n ?? 0));
}

/**
 * Count the files in a category.
 *
 * @param {number} id
 * @returns {Promise<number>}
 */
export function countFiles(id) {
	return db("files")
		.where({ category: id })
		.count({ n: "*" })
		.first()
		.then((row) => Number(row?.n ?? 0));
}

/**
 * Fetch the mother category's public columns, or `undefined` when it is a root.
 *
 * Used to render a breadcrumb without loading the whole tree.
 *
 * @param {number|null|undefined} id
 * @returns {Promise<object|undefined>}
 */
export function findParent(id) {
	if (!id) return Promise.resolve(undefined);
	return db("categories").where({ id }).first(CATEGORY_PICK_COLUMNS);
}

/**
 * Every ancestor of a category, ordered root-first.
 *
 * Walks `mother_category` upwards. Bounded by the number of categories, and
 * cycle-safe because the `prevent_category_cycles` trigger makes loops
 * impossible — plus the `seen` guard tolerates data imported from elsewhere.
 *
 * @param {number} id
 * @returns {Promise<object[]>}
 */
export async function ancestorsOf(id) {
	/** @type {object[]} */
	const walked = [];
	const seen = new Set();
	let cursor = id;

	while (cursor) {
		if (seen.has(cursor)) break;
		seen.add(cursor);
		const row = await db("categories").where({ id: cursor }).first(CATEGORY_COLUMNS);
		if (!row) break;
		// Collected leaf-first, then reversed below into root-first order.
		walked.push(row);
		cursor = row.mother_category ?? null;
	}

	// The walk started at the category itself, which is not one of its ancestors.
	return walked.slice(1).reverse();
}

/**
 * Fetch every category ordered for a tree or dropdown.
 *
 * @returns {Promise<object[]>}
 */
export function findAll() {
	return db("categories")
		.select(CATEGORY_COLUMNS)
		.orderBy("name", "asc");
}