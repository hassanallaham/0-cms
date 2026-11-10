/**
 * @file Post business rules.
 *
 * The interesting work here is relation handling. A post can link to other posts
 * and to files in both directions, and the two directions have different
 * ownership rules (SRS.md §4.3):
 *
 *  - **post → post** is directed and owned by the source post.
 *  - **post → file** is directed and owned by the post.
 *  - **file → post** is owned by the *file*, so editing a post must not add rows
 *    there; `File` appears in a post's detail view only because the UI wants a
 *    complete picture.
 *
 * @module modules/posts/post.service
 */

import * as repo from "./post.repository.js";
import * as fileRepo from "../files/file.repository.js";
import * as categoryRepo from "../categories/category.repository.js";
import * as typeRepo from "../types/type.repository.js";
import * as tagRepo from "../tags/tag.repository.js";
import * as tagService from "../tags/tag.service.js";
import { db } from "../../db/knex.js";
import {
	buildMeta,
	normalisePaging,
	offsetFor,
	parseSort,
	applySearch,
} from "../../utils/query.js";
import { uniqueSlug } from "../../utils/slug.js";
import { resolvePhotoPath, resolveRef, resolveRefs } from "../../utils/refs.js";
import { renderContent } from "../../utils/renderers.js";
import {
	mapSqliteError,
	ConflictError,
	NotFoundError,
	ValidationError,
} from "../../middleware/errors.js";

/** Columns searched by the free-text `q` parameter. */
const SEARCHABLE = ["title", "notes"];

/**
 * Load a post or raise a 404.
 *
 * @param {number} id
 * @returns {Promise<object>}
 * @throws {NotFoundError}
 */
export async function requirePost(id) {
	const post = await repo.findById(id);
	if (!post) throw new NotFoundError(`Post #${id} does not exist`);
	return post;
}

/**
 * Paginated, searchable, filterable, sortable post list.
 *
 * @param {Record<string, unknown>} query - Parsed query string.
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function list(query) {
	const { page, limit } = normalisePaging(query.page, query.limit);
	const order = parseSort(query.sort, repo.POST_SORTABLE, "updated_at", "desc");

	const base = db("posts");

	const status = query.status ?? query["filter[status]"];
	if (status) base.where("status", String(status));

	const typeRef = query.type;
	if (typeRef !== undefined && typeRef !== "") {
		base.where("type", await resolveRef("types", typeRef));
	}

	const categoryRef = query.category ?? query["filter[category]"];
	if (categoryRef !== undefined && categoryRef !== "") {
		base.where("category", await resolveRef("categories", categoryRef));
	}

	const title = query["filter[title]"];
	if (title) applySearch(base, String(title), ["title"]);

	applySearch(base, /** @type {string} */ (query.q), SEARCHABLE);

	const { data, total } = await repo.pageRows(base, {
		order,
		limit,
		offset: offsetFor(page, limit),
	});

	return { data: await withRelationNames(data), meta: buildMeta(page, limit, total) };
}

/**
 * Attach `type_name` and `category_name` to a page of posts.
 *
 * Two extra queries regardless of page size, instead of one per row: a list of
 * twenty posts must not cost twenty round trips.
 *
 * @param {object[]} rows
 * @returns {Promise<object[]>}
 */
async function withRelationNames(rows) {
	const typeIds = [...new Set(rows.map((row) => row.type).filter(Boolean))];
	const categoryIds = [...new Set(rows.map((row) => row.category).filter(Boolean))];

	const [types, categories] = await Promise.all([
		typeIds.length
			? db("types").whereIn("id", typeIds).select("id", "name")
			: [],
		categoryIds.length
			? db("categories").whereIn("id", categoryIds).select("id", "name")
			: [],
	]);

	const typeName = new Map(types.map((row) => [Number(row.id), row.name]));
	const categoryName = new Map(categories.map((row) => [Number(row.id), row.name]));

	return rows.map((row) => ({
		...row,
		type_name: row.type ? (typeName.get(Number(row.type)) ?? null) : null,
		category_name: row.category ? (categoryName.get(Number(row.category)) ?? null) : null,
	}));
}

/**
 * A post plus everything a detail page needs.
 *
 * @param {number} id
 * @returns {Promise<object>}
 */
export async function get(id) {
	const post = await repo.findById(id);
	if (!post) throw new NotFoundError(`Post #${id} does not exist`);

	const [type, category, tags, fileIds, relatedIds] = await Promise.all([
		post.type ? typeRepo.findById(post.type) : null,
		post.category ? categoryRepo.findById(post.category) : null,
		tagRepo.listForPost(id),
		repo.idsLinkedToFile(id),
		repo.idsLinkedToPost(id),
	]);

	// De-duplicate because post A → B and B → A both surface in B's page.
	const uniqueRelatedIds = [...new Set(relatedIds)];

	const [relatedPosts, relatedFiles] = await Promise.all([
		uniqueRelatedIds.length
			? db("posts")
					.whereIn("id", uniqueRelatedIds)
					.select(repo.POST_PICK_COLUMNS)
			: [],
		fileIds.length
			? db("files")
					.whereIn("id", fileIds)
					.select(fileRepo.FILE_PICK_COLUMNS)
			: [],
	]);

	return {
		...post,
		type: type ?? null,
		category: category ?? null,
		tags,
		related_posts: sortById(relatedPosts, uniqueRelatedIds),
		related_files: sortById(relatedFiles, fileIds),
	};
}

/**
 * A post rendered for display: content run through `marked`, plus its category
 * breadcrumb, related posts and related files.
 *
 * @param {number} id
 * @returns {Promise<object>}
 */
export async function getRendered(id) {
	const post = await repo.findById(id);
	if (!post) throw new NotFoundError(`Post #${id} does not exist`);

	const [type, category, tags, fileIds, outboundIds, inboundIds] = await Promise.all([
		post.type ? typeRepo.findById(post.type) : null,
		post.category ? categoryRepo.findById(post.category) : null,
		tagRepo.listForPost(id),
		repo.idsLinkedToFile(id),
		repo.idsOutbound(id),
		repo.idsInbound(id),
	]);

	const uniqueRelatedIds = [...new Set(outboundIds)];
	const uniqueReferencedIds = [...new Set(inboundIds)];
	const [relatedPosts, referencedPosts, relatedFiles, ancestors, photo] = await Promise.all([
		uniqueRelatedIds.length
			? db("posts")
					.whereIn("id", uniqueRelatedIds)
					.select(repo.POST_PICK_COLUMNS)
			: [],
		uniqueReferencedIds.length
			? db("posts")
					.whereIn("id", uniqueReferencedIds)
					.select(repo.POST_PICK_COLUMNS)
			: [],
		fileIds.length
			? db("files")
					.whereIn("id", fileIds)
					.select(fileRepo.FILE_PICK_COLUMNS)
			: [],
		post.category ? categoryRepo.ancestorsOf(post.category) : [],
		// `posts.photo` holds the file's path, so the row is resolved back from it
		// before a URL can be built (SRS §7.2).
		post.photo ? fileRepo.findByPath(post.photo) : null,
	]);

	return {
		...post,
		type: type ?? null,
		category: category ?? null,
		category_ancestors: ancestors,
		tags,
		html: renderContent(post.content, type?.slug),
		type_name: type?.name ?? null,
		photo_file: photo
			? { id: Number(photo.id), path: photo.path, mimetype: photo.mimetype }
			: null,
		// Outbound and inbound stay separate keys: the detail page shows them as two
		// tabs and must never merge them (SRS §8.4).
		related_posts: sortById(relatedPosts, uniqueRelatedIds),
		referenced_posts: sortById(referencedPosts, uniqueReferencedIds),
		related_files: sortById(relatedFiles, fileIds),
	};
}

/**
 * Paginated files linked to a post, in the post's own direction only.
 *
 * @param {number} id
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function listFiles(id, query) {
	await requirePost(id);
	const { page, limit } = normalisePaging(query.page, query.limit);
	const order = parseSort(query.sort, fileRepo.FILE_SORTABLE, "created_at", "desc");

	const base = db("files").join("posts_files", "posts_files.file", "files.id")
		.where("posts_files.post", id)
		.select("files.*");

	const { data, total } = await fileRepo.pageRows(base, order, limit, offsetFor(page, limit));

	return { data, meta: buildMeta(page, limit, total) };
}

/**
 * Paginated posts directly linked to a post, in both directions.
 *
 * @param {number} id
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function listRelatedPosts(id, query) {
	return listPostEdges(id, query, repo.idsOutbound);
}

/**
 * Posts that link *to* this post — the "pointing here" tab (SRS §8.4).
 *
 * @param {number} id
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function listReferencedPosts(id, query) {
	return listPostEdges(id, query, repo.idsInbound);
}

/**
 * Shared paging for the outbound and inbound post edge lists.
 *
 * `pick` chooses which side of the directed edge to read, so the two tabs cannot
 * drift apart in ordering or pagination behaviour.
 *
 * @param {number} id
 * @param {Record<string, unknown>} query
 * @param {(postId: number) => Promise<number[]>} pick
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
async function listPostEdges(id, query, pick) {
	await requirePost(id);
	const { page, limit } = normalisePaging(query.page, query.limit);
	const order = parseSort(query.sort, repo.POST_SORTABLE, "updated_at", "desc");

	const linkIds = [...new Set(await pick(id))];
	if (linkIds.length === 0) return { data: [], meta: buildMeta(page, limit, 0) };

	const base = db("posts").whereIn("id", linkIds);
	const { data, total } = await repo.pageRows(base, {
		order,
		limit,
		offset: offsetFor(page, limit),
	});

	return { data, meta: buildMeta(page, limit, total) };
}

/**
 * Paginated posts carrying a tag.
 *
 * @param {number} tagId
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function listByTag(tagId, query) {
	const { page, limit } = normalisePaging(query.page, query.limit);
	const order = parseSort(query.sort, repo.POST_SORTABLE, "updated_at", "desc");

	const { data, total } = await repo.pageRows(
		db("posts")
			.join("posts_tags", "posts_tags.post", "posts.id")
			.where("posts_tags.tag", tagId)
			.select("posts.id"),
		{ order, limit, offset: offsetFor(page, limit) },
	);

	return { data, meta: buildMeta(page, limit, total) };
}

/**
 * Create a post.
 *
 * @param {object} input - Validated by `createPostSchema`.
 * @returns {Promise<object>} The stored post.
 */
export async function create(input) {
	const title = String(input.title).trim();

	const clash = await repo.findByTitle(title);
	if (clash) throw new ConflictError(`A post titled "${title}" already exists`);

	const slug = await uniqueSlug(title, (candidate) => repo.slugExists(candidate));
	const [typeId, categoryId, photoPath] = await Promise.all([
		resolveOptional("types", input.type),
		resolveOptional("categories", input.category),
		resolvePhotoPath(input.photo),
	]);

	/** @type {Record<string, unknown>} */
	const row = {
		title,
		slug,
		status: input.status ?? "draft",
		type: typeId,
		category: categoryId,
		photo: photoPath,
		content: input.content ?? null,
		notes: input.notes ?? null,
	};

	try {
		const id = await repo.insert(row);
		if (input.relations !== undefined) await replaceRelations(id, input.relations);
		if (input.attachments?.length) await tagService.assignToPost(id, input.attachments);
		return requirePost(id);
	} catch (err) {
		throw mapSqliteError(err, "post");
	}
}

/**
 * Update a post.
 *
 * Renaming re-derives the slug. Relations are only touched when their key is
 * present, so a partial update cannot wipe links the form did not render.
 *
 * @param {number} id
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function update(id, input) {
	const current = await requirePost(id);

	/** @type {Record<string, unknown>} */
	const patch = {};

	if (input.title !== undefined && input.title !== null) {
		const title = String(input.title).trim();
		const clash = await repo.findByTitle(title);
		if (clash && Number(clash.id) !== Number(id)) {
			throw new ConflictError(`A post titled "${title}" already exists`);
		}
		if (title !== current.title) {
			patch.title = title;
			patch.slug = await uniqueSlug(title, (candidate) =>
				repo.slugExists(candidate, id),
			);
		}
	}

	if (input.status !== undefined) patch.status = input.status;
	if (input.content !== undefined) patch.content = input.content;
	if (input.notes !== undefined) patch.notes = input.notes;
	if (input.photo !== undefined) patch.photo = await resolvePhotoPath(input.photo);
	if (input.type !== undefined) patch.type = await resolveOptional("types", input.type);
	if (input.category !== undefined) {
		patch.category = await resolveOptional("categories", input.category);
	}

	if (Object.keys(patch).length > 0) {
		try {
			await repo.update(id, patch);
		} catch (err) {
			throw mapSqliteError(err, "post");
		}
	}

	if (input.relations !== undefined) {
		await replaceRelations(id, input.relations);
	}
	if (input.attachments !== undefined) {
		await tagService.assignToPost(id, input.attachments ?? []);
	}

	return get(id);
}

/**
 * Delete a post.
 *
 * Its join rows go with it via `ON DELETE CASCADE`. Its uploaded photo is a file
 * row, and deleting that file is refused while links remain — so the photo
 * simply stays, which is the documented behaviour for a post's own cover image.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function remove(id) {
	await requirePost(id);

	try {
		await repo.remove(id);
	} catch (err) {
		throw mapSqliteError(err, "post");
	}
}

/**
 * Link one file to this post.
 *
 * Idempotent: linking a file that is already attached succeeds quietly.
 *
 * @param {number} id
 * @param {number} fileId
 * @returns {Promise<object>} The post.
 */
export async function attachFile(id, fileId) {
	await requirePost(id);
	const file = await fileRepo.findById(fileId);
	if (!file) throw new NotFoundError(`File #${fileId} does not exist`);

	const existing = await db("posts_files")
		.where({ post: id, file: fileId })
		.first("id");
	if (!existing) {
		await db("posts_files").insert({ post: id, file: Number(fileId) });
	}

	return get(id);
}

/**
 * Remove a file link from this post.
 *
 * @param {number} id
 * @param {number} fileId
 * @returns {Promise<object>} The post.
 */
export async function detachFile(id, fileId) {
	await requirePost(id);
	await db("posts_files").where({ post: id, file: Number(fileId) }).delete();
	return get(id);
}

/**
 * Link this post to another post.
 *
 * `blocked_posts_no_self_edge` rejects a self-link at the database level, but a
 * friendly check first saves the user a 409.
 *
 * @param {number} id
 * @param {number} targetId
 * @returns {Promise<object>} The post.
 */
export async function linkPost(id, targetId) {
	await requirePost(id);
	if (Number(targetId) === Number(id)) {
		throw new ValidationError("A post cannot link to itself", [
			{ field: "post", message: "Choose a different post" },
		]);
	}
	await requirePost(targetId);

	const existing = await db("posts_posts")
		.where({ from_post: id, to_post: Number(targetId) })
		.first("id");
	if (!existing) {
		await db("posts_posts").insert({ from_post: id, to_post: Number(targetId) });
	}

	return get(id);
}

/**
 * Remove this post's outbound link to another post.
 *
 * Only the `id → targetId` edge is touched: an inbound link from `targetId`
 * belongs to that post's own outgoing set and must survive (SRS §6.3).
 *
 * @param {number} id
 * @param {number} targetId
 * @returns {Promise<object>} The post.
 */
export async function unlinkPost(id, targetId) {
	await requirePost(id);
	await db("posts_posts")
		.where({ from_post: Number(id), to_post: Number(targetId) })
		.delete();

	return get(id);
}

/**
 * Split a relation payload into post targets and file targets.
 *
 * Two shapes reach this function: the validated form/JSON payload
 * `[{ type, id | name }]` produced by `createPostSchema`, and the raw
 * `{ posts: [...], files: [...] }` object accepted by `PUT /:id/relations`.
 * Both are reduced to the same two buckets so the replacement logic below has a
 * single shape to handle.
 *
 * @param {unknown} relations
 * @returns {{ postTargets: unknown[], fileTargets: unknown[] }}
 */
function splitRelationInput(relations) {
	if (Array.isArray(relations)) {
		return {
			postTargets: relations.filter((entry) => entry?.type === "posts"),
			fileTargets: relations.filter((entry) => entry?.type === "files"),
		};
	}

	const object = relations && typeof relations === "object" ? relations : {};
	return {
		postTargets: object.posts ?? [],
		fileTargets: object.files ?? [],
	};
}

/**
 * Replace the whole relation set of a post.
 *
 * `targetIds` for `posts` replaces post-to-post links; `fileIds` replaces
 * post-to-file links. Both lists are filtered for existence up front so a typo
 * produces one clear error instead of a foreign-key 409.
 *
 * @param {number} postId
 * @param {Record<string, unknown[]>} relations - `{ posts: [...], files: [...] }`.
 * @returns {Promise<{ posts: object[], files: object[] }>}
 */
export async function replaceRelations(postId, relations) {
	const { postTargets, fileTargets } = splitRelationInput(relations);

	const [postIds, fileIds] = await Promise.all([
		resolveRefs("posts", postTargets, { exclude: postId }),
		resolveRefs("files", fileTargets),
	]);

	await repo.replacePostLinks(postId, postIds);
	await repo.replaceFileLinks(postId, fileIds);

	const [relatedPosts, relatedFiles] = await Promise.all([
		postIds.length
			? db("posts")
					.whereIn("id", postIds)
					.select(repo.POST_PICK_COLUMNS)
			: [],
		fileIds.length
			? db("files")
					.whereIn("id", fileIds)
					.select(fileRepo.FILE_PICK_COLUMNS)
			: [],
	]);

	return {
		posts: sortById(relatedPosts, postIds),
		files: sortById(relatedFiles, fileIds),
	};
}

/**
 * Every post, ordered by title. Used to populate picker options.
 *
 * @returns {Promise<object[]>}
 */
export async function options() {
	return db("posts")
		.select(repo.POST_PICK_COLUMNS)
		.orderBy("title", "asc");
}

/**
 * Resolve a relation reference that may be absent or blank.
 *
 * @param {string} table
 * @param {unknown} ref
 * @returns {Promise<number|null>}
 */
async function resolveOptional(table, ref) {
	if (ref === undefined) return undefined;
	return resolveRef(table, ref);
}

/**
 * Re-order rows to match a requested id sequence.
 *
 * SQLite cannot `ORDER BY FIELD(...)`, and a `whereIn` query returns rows in
 * primary-key order — which would silently break an explicit `sort=title`.
 *
 * @template {object} T
 * @param {T[]} rows
 * @param {number[]} order
 * @returns {T[]}
 */
function sortById(rows, order) {
	const rank = new Map(order.map((id, index) => [Number(id), index]));
	return [...rows].sort(
		(left, right) =>
			(rank.get(Number(left.id)) ?? Number.MAX_SAFE_INTEGER) -
			(rank.get(Number(right.id)) ?? Number.MAX_SAFE_INTEGER),
	);
}
