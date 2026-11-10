/**
 * @file Data access for `types`.
 *
 * `types` is small — `Article` and `Note` are seeded — but it is a first-class
 * entity: SRS §6.3 gives types the same create/update/delete routes as the other
 * entities and §8.3 gives them their own form pages.
 *
 * @module modules/types/type.repository
 */

import { db } from "../../db/knex.js";

/** Columns safe to expose in any context. */
export const TYPE_COLUMNS = ["id", "name", "slug"];

/**
 * Fetch one type by id.
 *
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
export function findById(id) {
	return db("types").where({ id }).first(TYPE_COLUMNS);
}

/**
 * Fetch one type by slug.
 *
 * @param {string} slug
 * @returns {Promise<object|undefined>}
 */
export function findBySlug(slug) {
	return db("types").where({ slug }).first(TYPE_COLUMNS);
}

/**
 * Fetch one type by exact name (case-insensitive).
 *
 * @param {string} name
 * @returns {Promise<object|undefined>}
 */
export function findByName(name) {
	return db("types")
		.whereRaw("lower(name) = lower(?)", [name])
		.first(TYPE_COLUMNS);
}

/**
 * Count the posts of a given type.
 *
 * @param {number} id
 * @returns {Promise<number>}
 */
export function countPosts(id) {
	return db("posts")
		.where({ type: id })
		.count({ n: "*" })
		.first()
		.then((row) => Number(row?.n ?? 0));
}

/**
 * Every type, ordered by name. Used to populate picker options.
 *
 * @returns {Promise<object[]>}
 */
export function findAll() {
	return db("types")
		.select(TYPE_COLUMNS)
		.orderBy("name", "asc");
}

/**
 * Every type with its post count, ordered by name.
 *
 * @returns {Promise<object[]>}
 */
export function findAllWithCounts() {
	return db("types")
		.leftJoin("posts", "posts.type", "types.id")
		.groupBy("types.id", "types.name", "types.slug")
		.select("types.id", "types.name", "types.slug")
		.count({ posts: "posts.id" })
		.orderBy("types.name", "asc");
}

/**
 * Whether a slug is taken, optionally ignoring one id.
 *
 * @param {string} slug
 * @param {number} [excludeId]
 * @returns {Promise<boolean>}
 */
export async function slugExists(slug, excludeId) {
	const query = db("types").where({ slug });
	if (excludeId !== undefined) query.whereNot({ id: excludeId });
	return Boolean(await query.first("id"));
}

/**
 * Whether a name is taken, optionally ignoring one id.
 *
 * @param {string} name
 * @param {number} [excludeId]
 * @returns {Promise<boolean>}
 */
export async function nameExists(name, excludeId) {
	const query = db("types").whereRaw("lower(name) = lower(?)", [name]);
	if (excludeId !== undefined) query.whereNot({ id: excludeId });
	return Boolean(await query.first("id"));
}

/**
 * Insert a type.
 *
 * @param {{ name: string, slug: string }} row
 * @returns {Promise<number>}
 */
export async function insert(row) {
	const id = await db("types").insert(row);
	return Number(Array.isArray(id) ? id[0] : id);
}

/**
 * Update a type's columns.
 *
 * @param {number} id
 * @param {Partial<{ name: string, slug: string }>} patch
 * @returns {Promise<void>}
 */
export async function update(id, patch) {
	await db("types").where({ id }).update(patch);
}

/**
 * Delete a type row.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function remove(id) {
	await db("types").where({ id }).delete();
}
