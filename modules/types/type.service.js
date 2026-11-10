/**
 * @file Type reads and writes.
 *
 * A type decides how a post's content is rendered, so the rules here are about
 * keeping the set safe to edit: names and slugs stay unique, a type in use cannot
 * be deleted, and a type named in `MARKDOWN_TYPES` cannot be deleted either
 * because that would silently change how existing posts render.
 *
 * @module modules/types/type.service
 */

import * as repo from "./type.repository.js";
import * as postRepo from "../posts/post.repository.js";
import { db } from "../../db/knex.js";
import {
	buildMeta,
	normalisePaging,
	offsetFor,
	parseSort,
	applySearch,
} from "../../utils/query.js";
import {
	ConflictError,
	NotFoundError,
	mapSqliteError,
} from "../../middleware/errors.js";
import { uniqueSlug } from "../../utils/slug.js";
import { config } from "../../config/index.js";

/** Columns permitted in a `sort` parameter. */
const SORTABLE = ["id", "name", "slug"];

/**
 * Load a type or raise a 404.
 *
 * @param {number} id
 * @returns {Promise<object>}
 * @throws {NotFoundError}
 */
export async function requireType(id) {
	const type = await repo.findById(id);
	if (!type) throw new NotFoundError(`Type #${id} does not exist`);
	return type;
}

/**
 * Paginated type list, each row carrying its post count.
 *
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function list(query) {
	const { page, limit } = normalisePaging(query.page, query.limit);
	const order = parseSort(query.sort, SORTABLE, "name", "asc");

	const base = db("types");
	applySearch(base, /** @type {string} */ (query.q), ["name"]);

	const totalRow = await base.clone().count({ n: "*" }).first();
	const total = Number(totalRow?.n ?? 0);

	const data = await base
		.clone()
		.select(repo.TYPE_COLUMNS)
		.orderBy(order.column, order.direction)
		.orderBy("id", "asc")
		.limit(limit)
		.offset(offsetFor(page, limit));

	// Counts are attached after paging so the list query stays cheap.
	const counts = await db("posts")
		.whereIn("type", data.map((row) => Number(row.id)))
		.groupBy("type")
		.select("type")
		.count({ n: "*" });
	const countBy = new Map(counts.map((row) => [Number(row.type), Number(row.n)]));

	return {
		data: data.map((row) => ({ ...row, posts: countBy.get(Number(row.id)) ?? 0 })),
		meta: buildMeta(page, limit, total),
	};
}

/**
 * A type plus its post count.
 *
 * @param {number} id
 * @returns {Promise<object>}
 */
export async function get(id) {
	const type = await requireType(id);
	const posts = await repo.countPosts(id);
	return { ...type, counts: { posts } };
}

/**
 * Paginated posts of a type.
 *
 * @param {number} id
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function listPosts(id, query) {
	await requireType(id);
	const { page, limit } = normalisePaging(query.page, query.limit);
	const order = parseSort(query.sort, postRepo.POST_SORTABLE, "updated_at", "desc");

	const { data, total } = await postRepo.pageRows(
		db("posts").where({ type: id }),
		{ order, limit, offset: offsetFor(page, limit) },
	);

	return { data, meta: buildMeta(page, limit, total) };
}

/**
 * Every type, ordered by name. Used to populate picker options.
 *
 * @returns {Promise<object[]>}
 */
export async function options() {
	return repo.findAll();
}

/**
 * Create a type.
 *
 * @param {{ name: string, slug?: string | null }} input
 * @returns {Promise<object>} The stored type.
 */
export async function create(input) {
	const name = String(input.name).trim();
	if (await repo.nameExists(name)) {
		throw new ConflictError(`A type named "${name}" already exists`);
	}

	const slug =
		input.slug === undefined || input.slug === null
			? await uniqueSlug(name, (candidate) => repo.slugExists(candidate))
			: String(input.slug).trim();
	if (await repo.slugExists(slug)) {
		throw new ConflictError(`The slug "${slug}" is already taken`);
	}

	try {
		const id = await repo.insert({ name, slug });
		return requireType(id);
	} catch (err) {
		throw mapSqliteError(err, "type");
	}
}

/**
 * Update a type. Renaming re-derives the slug unless one was supplied.
 *
 * @param {number} id
 * @param {{ name?: string, slug?: string | null }} input
 * @returns {Promise<object>}
 */
export async function update(id, input) {
	const current = await requireType(id);

	/** @type {{ name?: string, slug?: string }} */
	const patch = {};

	if (input.name !== undefined && input.name !== null) {
		const name = String(input.name).trim();
		if (name !== current.name && (await repo.nameExists(name, id))) {
			throw new ConflictError(`A type named "${name}" already exists`);
		}
		if (name !== current.name) patch.name = name;
	}

	if (input.slug !== undefined && input.slug !== null) {
		const slug = String(input.slug).trim();
		if (await repo.slugExists(slug, id)) {
			throw new ConflictError(`The slug "${slug}" is already taken`);
		}
		patch.slug = slug;
	} else if (patch.name !== undefined) {
		patch.slug = await uniqueSlug(patch.name, (candidate) => repo.slugExists(candidate, id));
	}

	if (Object.keys(patch).length === 0) return get(id);

	try {
		await repo.update(id, patch);
	} catch (err) {
		throw mapSqliteError(err, "type");
	}
	return get(id);
}

/**
 * Delete a type.
 *
 * Refused while posts still use it, and refused for a type listed in
 * `MARKDOWN_TYPES` — removing that would retroactively change how those posts
 * render, which is a data change disguised as a schema change.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function remove(id) {
	const type = await requireType(id);

	const posts = await repo.countPosts(id);
	if (posts > 0) {
		throw new ConflictError(
			`Cannot delete type "${type.name}": ${posts} ${posts === 1 ? "post uses" : "posts use"} it. ` +
				"Move those posts to another type first.",
		);
	}

	if (config.ui.markdownTypes.includes(type.slug)) {
		throw new ConflictError(
			`Cannot delete "${type.name}": it is listed in MARKDOWN_TYPES, so existing posts of this ` +
				"type would change how they render. Remove it from the setting first.",
		);
	}

	await repo.remove(id);
}
