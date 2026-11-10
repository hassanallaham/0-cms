/**
 * @file Category business rules.
 *
 * Owns the invariants that make the category tree trustworthy:
 *
 *  - `name` and `slug` are unique, and a slug is derived from the name;
 *  - a category is never its own parent, and never a descendant of itself;
 *  - a category with children, posts or files cannot be deleted.
 *
 * Services never touch Express and never see `req`/`res`.
 *
 * @module modules/categories/category.service
 */

import * as repo from "./category.repository.js";
import * as postRepo from "../posts/post.repository.js";
import * as fileRepo from "../files/file.repository.js";
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
import { resolvePhotoPath, resolveRef } from "../../utils/refs.js";
import {
	mapSqliteError,
	ConflictError,
	NotFoundError,
	ValidationError,
} from "../../middleware/errors.js";

/** Extra columns a list may be sorted by, beyond {@link repo.CATEGORY_SORTABLE}. */
const SORTABLE = repo.CATEGORY_SORTABLE;

/** Columns searched by the free-text `q` parameter. */
const SEARCHABLE = ["name", "description"];

/**
 * Load a category or raise a 404.
 *
 * @param {number} id
 * @returns {Promise<object>}
 * @throws {NotFoundError}
 */
export async function requireCategory(id) {
	const category = await repo.findById(id);
	if (!category) throw new NotFoundError(`Category #${id} does not exist`);
	return category;
}

/**
 * Paginated, searchable, filterable, sortable category list.
 *
 * @param {Record<string, unknown>} query - Parsed query string.
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function list(query) {
	const { page, limit } = normalisePaging(query.page, query.limit);
	const filters = extractFilters(query);

	const base = db("categories");

	const parentFilter = filters.mother_category ?? filters["mother_category"];
	if (parentFilter !== undefined && parentFilter !== "") {
		base.where("mother_category", Number(parentFilter));
	}
	if (filters.root === "true") base.whereNull("mother_category");
	if (filters.name) applySearch(base, String(filters.name), ["name"]);

	applySearch(base, /** @type {string} */ (query.q), SEARCHABLE);

	const totalRow = await base.clone().count({ n: "*" }).first();
	const total = Number(totalRow?.n ?? 0);

	const order = parseSort(query.sort, SORTABLE, "name", "asc");

	const data = await base
		.clone()
		.select(repo.CATEGORY_COLUMNS)
		.orderBy(order.column, order.direction)
		// A stable tiebreaker keeps pagination from repeating or dropping rows.
		.orderBy("id", "asc")
		.limit(limit)
		.offset(offsetFor(page, limit));

	return { data, meta: buildMeta(page, limit, total) };
}

/**
 * A category plus everything a detail page needs.
 *
 * @param {number} id
 * @returns {Promise<object>}
 */
export async function get(id) {
	const category = await repo.findById(id);
	if (!category) throw new NotFoundError(`Category #${id} does not exist`);

	const [children, posts, files, parent, ancestors] = await Promise.all([
		repo.countChildren(id),
		repo.countPosts(id),
		repo.countFiles(id),
		repo.findParent(category.mother_category),
		repo.ancestorsOf(id),
	]);

	return {
		...category,
		parent: parent ?? null,
		ancestors,
		counts: { children, posts, files },
	};
}

/**
 * Paginated sub-categories.
 *
 * @param {number} id
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function listChildren(id, query) {
	await requireCategory(id);
	const { page, limit } = normalisePaging(query.page, query.limit);

	const base = db("categories").where({ mother_category: id });
	const totalRow = await base.clone().count({ n: "*" }).first();
	const data = await base
		.clone()
		.select(repo.CATEGORY_COLUMNS)
		.orderBy("name", "asc")
		.limit(limit)
		.offset(offsetFor(page, limit));

	return {
		data,
		meta: buildMeta(page, limit, Number(totalRow?.n ?? 0)),
	};
}

/**
 * Paginated posts belonging to a category.
 *
 * @param {number} id
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function listPosts(id, query) {
	await requireCategory(id);
	const { page, limit } = normalisePaging(query.page, query.limit);
	const order = parseSort(
		query.sort,
		postRepo.POST_SORTABLE,
		"updated_at",
		"desc",
	);

	const { data, total } = await postRepo.listByCategory(id, {
		order,
		limit,
		offset: offsetFor(page, limit),
	});

	return { data, meta: buildMeta(page, limit, total) };
}

/**
 * Paginated files belonging to a category.
 *
 * @param {number} id
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function listFiles(id, query) {
	await requireCategory(id);
	const { page, limit } = normalisePaging(query.page, query.limit);
	const order = parseSort(
		query.sort,
		fileRepo.FILE_SORTABLE,
		"created_at",
		"desc",
	);

	const { data, total } = await fileRepo.listByCategory(id, {
		order,
		limit,
		offset: offsetFor(page, limit),
	});

	return { data, meta: buildMeta(page, limit, total) };
}

/**
 * Every category, ordered by name. Used to populate picker options and trees.
 *
 * @returns {Promise<object[]>}
 */
export async function options() {
	return repo.findAll();
}

/**
 * Create a category.
 *
 * @param {object} input - Validated by `createCategorySchema`.
 * @returns {Promise<object>} The stored category.
 */
export async function create(input) {
	const name = String(input.name).trim();

	const clash = await repo.findByName(name);
	if (clash)
		throw new ConflictError(`A category named "${name}" already exists`);

	const slug = await uniqueSlug(name, (candidate) =>
		repo.slugExists(candidate),
	);

	const motherCategoryId = await resolveMother(input.mother_category, null);

	/** @type {Record<string, unknown>} */
	const row = {
		name,
		slug,
		description: input.description ?? null,
		mother_category: motherCategoryId,
		photo: await resolvePhotoPath(input.photo),
	};

	try {
		const id = await repo.insert(row);
		return requireCategory(id);
	} catch (err) {
		throw mapSqliteError(err, "category");
	}
}

/**
 * Update a category. Only the keys present in `input` are written.
 *
 * Renaming re-derives the slug, which means a rename can collide with another
 * row's slug; the suffixing in `uniqueSlug` resolves that.
 *
 * @param {number} id
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function update(id, input) {
	const current = await requireCategory(id);

	/** @type {Record<string, unknown>} */
	const patch = {};

	if (input.name !== undefined && input.name !== null) {
		const name = String(input.name).trim();
		const clash = await repo.findByName(name);
		if (clash && Number(clash.id) !== Number(id)) {
			throw new ConflictError(
				`A category named "${name}" already exists`,
			);
		}
		if (name !== current.name) {
			patch.name = name;
			patch.slug = await uniqueSlug(name, (candidate) =>
				repo.slugExists(candidate, id),
			);
		}
	}

	if (input.description !== undefined) {
		patch.description = input.description;
	}
	if (input.photo !== undefined) {
		patch.photo = await resolvePhotoPath(input.photo);
	}

	if (input.mother_category !== undefined) {
		patch.mother_category = await resolveMother(input.mother_category, id);
	}

	if (Object.keys(patch).length === 0) return current;

	try {
		await repo.update(id, patch);
	} catch (err) {
		throw mapSqliteError(err, "category");
	}

	return get(id);
}

/**
 * Delete a category.
 *
 * Refuses while anything still points at it, because `mother_category` and the
 * `category` columns on posts and files are `ON DELETE RESTRICT`. The message
 * names the blockers so the dashboard can explain what to clear first.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function remove(id) {
	await requireCategory(id);

	const [children, posts, files] = await Promise.all([
		repo.countChildren(id),
		repo.countPosts(id),
		repo.countFiles(id),
	]);

	/** @type {string[]} */
	const blockers = [];
	if (children > 0) {
		blockers.push(`${children} sub-categor${children === 1 ? "y" : "ies"}`);
	}
	if (posts > 0) blockers.push(`${posts} post${posts === 1 ? "" : "s"}`);
	if (files > 0) blockers.push(`${files} file${files === 1 ? "" : "s"}`);

	if (blockers.length > 0) {
		throw new ConflictError(
			`Cannot delete this category: it still has ${blockers.join(" and ")}. ` +
				"Move or delete them first.",
		);
	}

	try {
		await repo.remove(id);
	} catch (err) {
		throw mapSqliteError(err, "category");
	}
}

/**
 * Resolve a submitted parent reference and prove it cannot create a loop.
 *
 * `resolveRef` turns an id or a typed name into a category id; walking the
 * candidate's own ancestry is what catches "make this category a child of its
 * own grandchild". The database trigger enforces the same rule, so a bug here
 * still cannot corrupt the tree — it just fails earlier with a better message.
 *
 * @param {unknown} input - Submitted parent reference, possibly blank.
 * @param {number|null} selfId - Category being updated, excluded from resolution.
 * @returns {Promise<number|null>}
 */
async function resolveMother(input, selfId) {
	if (input === undefined) return undefined;

	// Checked against the raw input first: `resolveRef` is given the row being
	// edited as an exclusion, so handing it its own id would fall through to a
	// text search and report "several categories match" instead of the real reason.
	if (selfId !== null && Number(input) === Number(selfId)) {
		throw new ValidationError("A category cannot be its own parent", [
			{ field: "mother_category", message: "Pick a different parent" },
		]);
	}

	const parentId = await resolveRef("categories", input, {
		exclude: selfId ?? undefined,
	});
	if (parentId === null) return null;

	if (selfId !== null && parentId === Number(selfId)) {
		throw new ValidationError("A category cannot be its own parent", [
			{ field: "mother_category", message: "Pick a different parent" },
		]);
	}

	if (selfId !== null && (await isDescendant(parentId, selfId))) {
		throw new ValidationError(
			"That category is a descendant of this one — the link would create a loop",
			[
				{
					field: "mother_category",
					message: "Pick a category outside this subtree",
				},
			],
		);
	}

	return parentId;
}

/**
 * True when `candidateId` sits underneath `ancestorId` in the category tree.
 *
 * @param {number} candidateId
 * @param {number} ancestorId
 * @returns {Promise<boolean>}
 */
async function isDescendant(candidateId, ancestorId) {
	return (await repo.ancestorsOf(candidateId)).some(
		(row) => Number(row.id) === Number(ancestorId),
	);
}
