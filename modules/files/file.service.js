/**
 * @file File business rules: validation, de-duplication and deletion.
 *
 * The invariant that shapes this module is that a file row and its blob have the
 * same lifetime. Uploads are content-addressed by SHA-256, so re-uploading the
 * same bytes reuses the existing row instead of creating a second copy
 * (SRS.md §5.3), and a row can only be deleted once nothing references it.
 *
 * @module modules/files/file.service
 */

import * as repo from "./file.repository.js";
import * as postRepo from "../posts/post.repository.js";
import * as postService from "../posts/post.service.js";
import * as tagService from "../tags/tag.service.js";
import { db } from "../../db/knex.js";
import { config } from "../../config/index.js";
import {
	buildMeta,
	normalisePaging,
	offsetFor,
	parseSort,
	applySearch,
} from "../../utils/query.js";
import { resolveRef, resolveRefs } from "../../utils/refs.js";
import {
	allocateBlobPath,
	assertAllowedMimeType,
	blobUrl,
	discardTemp,
	formatSize,
	hashFile,
	moveInto,
	normaliseMimeType,
	removeBlob,
	safeOriginalName,
} from "../../utils/storage.js";
import {
	AppError,
	mapSqliteError,
	ConflictError,
	NotFoundError,
	PayloadTooLargeError,
	ValidationError,
} from "../../middleware/errors.js";

/** Columns searched by the free-text `q` parameter. */
const SEARCHABLE = ["original_name", "mimetype"];

/**
 * Load a file or raise a 404.
 *
 * @param {number} id
 * @returns {Promise<object>}
 * @throws {NotFoundError}
 */
export async function requireFile(id) {
	const file = await repo.findById(id);
	if (!file) throw new NotFoundError(`File #${id} does not exist`);
	return file;
}

/**
 * Paginated, searchable, filterable, sortable file list.
 *
 * @param {Record<string, unknown>} query - Parsed query string.
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function list(query) {
	const { page, limit } = normalisePaging(query.page, query.limit);
	const order = parseSort(query.sort, repo.FILE_SORTABLE, "created_at", "desc");

	const base = db("files");

	const mimetype = query.mimetype ?? query["filter[mimetype]"];
	if (mimetype) base.where("mimetype", String(mimetype));

	const extension = query["filter[extension]"];
	if (extension) base.where("stored_name", "like", `%.${String(extension).replace(/^\./, "")}`);

	const categoryRef = query.category;
	if (categoryRef !== undefined && categoryRef !== "") {
		base.where("category", await resolveRef("categories", categoryRef));
	}

	applySearch(base, /** @type {string} */ (query.q), SEARCHABLE);

	const { data, total } = await repo.pageRows(
		base,
		order,
		limit,
		offsetFor(page, limit),
	);

	return { data, meta: buildMeta(page, limit, total) };
}

/**
 * A file plus the counts and relations a detail page needs.
 *
 * @param {number} id
 * @returns {Promise<object>}
 */
export async function get(id) {
	const file = await repo.findById(id);
	if (!file) throw new NotFoundError(`File #${id} does not exist`);

	const [category, tags, attachedPostIds, outboundFileIds, inboundFileIds] = await Promise.all([
			file.category
			? db("categories").where({ id: file.category }).first("id", "name", "slug")
			: null,
		db("files_tags")
			.join("tags", "tags.id", "files_tags.tag")
			.where("files_tags.file", id)
			.select("tags.id", "tags.name", "tags.slug"),
		repo.postIdsAttached(id),
		repo.idsOutbound(id),
		repo.idsInbound(id),
	]);

	// A post reaches a file only through a `posts_files` row; a post-to-post edge
	// does not pass a file along, so this is the whole list.
	const postIds = attachedPostIds.map(Number);

	const [relatedPosts, outboundFiles, inboundFiles] = await Promise.all([
		postIds.length
			? db("posts")
					.whereIn("id", postIds)
					.select(postRepo.POST_PICK_COLUMNS)
			: [],
		outboundFileIds.length
			? db("files")
					.whereIn("id", outboundFileIds)
					.select(repo.FILE_PICK_COLUMNS)
			: [],
		inboundFileIds.length
			? db("files")
					.whereIn("id", inboundFileIds)
					.select(repo.FILE_PICK_COLUMNS)
			: [],
	]);

	return {
		...file,
		category: category ?? null,
		tags,
		// Every row here has a real `posts_files` row, so the detail page can offer
		// a detach control on each one.
		related_posts: relatedPosts,
		// Kept apart so the detail page can show "related files" and "files pointing
		// here" as their own tabs (SRS §8.4).
		related_files: outboundFiles,
		referenced_files: inboundFiles,
		counts: {
			posts: postIds.length,
			files: new Set([...outboundFileIds, ...inboundFileIds]).size,
		},
	};
}

/**
 * A file resolved from a stored path.
 *
 * The `photo` column on posts, categories and tags holds a path (SRS §7.2), so
 * this is how those columns are turned back into a row.
 *
 * @param {string} path
 * @returns {Promise<object>}
 */
export async function getByPath(path) {
	const file = await repo.findByPath(path);
	if (!file) throw new NotFoundError(`No file is stored at ${path}`);
	return { ...file, url: blobUrl(file.path) };
}

/**
 * Store an uploaded blob, or reuse the row when its bytes are already known.
 *
 * The order of operations matters. Multer has already written the upload to
 * `FILES_DIR/temp`; from here the blob is hashed, validated, and either
 * discarded as a duplicate or moved into place with `rename`. The row is inserted
 * only after the bytes are safely in their final location, so a crash can leave
 * an orphaned blob (swept by the dashboard) but never a row pointing at bytes
 * that were never written.
 *
 * @param {{ originalname?: string, mimetype?: string, size?: number, path?: string }} uploaded - A multer file object.
 * @param {{ category?: unknown, tags?: unknown, posts?: unknown }} [options] - Relations requested alongside the upload.
 * @returns {Promise<{ file: object, deduplicated: boolean }>}
 */
export async function store(uploaded, { category, tags, posts } = {}) {
	if (!uploaded?.path) {
		throw new ValidationError("No file was received", [
			{ field: "file", message: "Choose a file to upload" },
		]);
	}

	const originalName = safeOriginalName(uploaded.originalname);
	const mimetype = normaliseMimeType(uploaded.mimetype);

	assertAllowedMimeType(mimetype, originalName);

	const size = Number(uploaded.size ?? 0);
	if (size <= 0) {
		await discardTemp(uploaded.path);
		throw new ValidationError(`${originalName} is empty`, [
			{ field: "file", message: "The file has no content" },
		]);
	}
	if (size > config.files.maxBytes) {
		// The temp copy is discarded here because this request is over.
		await discardTemp(uploaded.path);
		throw new PayloadTooLargeError(
			`${formatSize(size)} exceeds the ${formatSize(config.files.maxBytes)} limit`,
		);
	}

	const hash = await hashFile(uploaded.path);

	// Relations are resolved before the dedupe lookup so that a bad reference is
	// reported as a validation error rather than silently attaching to an existing
	// row. `undefined` means "not supplied" and leaves the stored value untouched.
	//
	// The temp copy is discarded if resolution throws: this request is over, and the
	// bytes would otherwise sit in `temp` until the next boot swept them.
	/** @type {number|undefined} */
	let categoryId;
	/** @type {number[]} */
	let tagIds = [];
	/** @type {number[]} */
	let postIds = [];
	try {
		categoryId = category === undefined ? undefined : await resolveRef("categories", category, { field: "category" });
		tagIds = tags === undefined ? [] : await resolveRefs("tags", tags, { field: "tags" });
		postIds = posts === undefined ? [] : await resolveRefs("posts", posts, { field: "posts" });
	} catch (err) {
		await discardTemp(uploaded.path);
		throw err;
	}

	/**
	 * Apply links requested with the upload to a stored row.
	 *
	 * Runs on the deduplicated path too (SRS §7.2): the user asked for these
	 * relations, and reusing the bytes must not discard that intent.
	 *
	 * @param {number} fileId
	 * @returns {Promise<void>}
	 */
	const applyLinks = async (fileId) => {
		if (categoryId !== undefined && categoryId !== null) {
			await repo.update(fileId, { category: categoryId });
		}
		for (const tagId of tagIds) {
			await tagService.addToFile(fileId, tagId);
		}
		for (const postId of postIds) {
			await postService.attachFile(postId, fileId);
		}
	};

	const existing = await repo.findByHash(hash);
	if (existing) {
		// Identical bytes are already on disk: drop the copy and reuse the row.
		await discardTemp(uploaded.path);
		await applyLinks(existing.id);

		return {
			file: await requireFile(existing.id),
			deduplicated: true,
		};
	}

	const target = allocateBlobPath(mimetype);
	try {
		await moveInto(uploaded.path, target.absolutePath);
	} catch (err) {
		// Without the bytes there is nothing to record, and the upload is lost.
		await discardTemp(uploaded.path);
		throw new AppError("Could not store the uploaded file", {
			statusCode: 500,
			code: "STORAGE_ERROR",
			isOperational: false,
			cause: err,
		});
	}

	// Tracked separately from `target` so a rollback only deletes a row this call
	// created. A dedupe race that loses the insert must not take the winner's row.
	let insertedId;
	try {
		insertedId = await repo.insert({
			category: categoryId ?? null,
			mimetype,
			original_name: originalName,
			stored_name: target.storedName,
			size,
			path: target.path,
			hash,
		});
		await applyLinks(insertedId);
		return { file: await requireFile(insertedId), deduplicated: false };
	} catch (err) {
		// Compensate. `applyLinks` can fail after the row exists — a bad reference,
		// a closed connection — and leaving that row behind would point at bytes
		// this function is about to delete. The row goes first, so the database is
		// never advertising a blob that is already gone. Join rows cascade away.
		if (insertedId !== undefined) {
			await repo.remove(insertedId).catch(() => {});
		}
		await removeBlob(target.path);
		throw mapSqliteError(err, "file");
	}
}

/**
 * Update a file's metadata. Only the category is mutable.
 *
 * @param {number} id
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function update(id, input) {
	await requireFile(id);

	if (input.category === undefined) return get(id);

	const categoryId = await resolveRef("categories", input.category);

	try {
		await repo.update(id, { category: categoryId });
	} catch (err) {
		throw mapSqliteError(err, "file");
	}

	return get(id);
}

/**
 * Delete a file row and its blob.
 *
 * Refused while any post, file or tag references it, because those columns are
 * `ON DELETE RESTRICT`. The message names the blockers.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function remove(id) {
	const file = await requireFile(id);

	const [attachedPosts, linkedFiles, tagCount] = await Promise.all([
		repo.countAttachedPosts(id),
		repo.countLinkedFiles(id),
		db("files_tags")
			.where({ file: id })
			.count({ n: "*" })
			.first()
			.then((row) => Number(row?.n ?? 0)),
	]);

	/** @type {string[]} */
	const blockers = [];
	if (attachedPosts > 0) {
		blockers.push(`${attachedPosts} post${attachedPosts === 1 ? "" : "s"}`);
	}
	if (tagCount > 0) blockers.push(`${tagCount} tag${tagCount === 1 ? "" : "s"}`);
	if (linkedFiles > 0) {
		blockers.push(`${linkedFiles} linked file${linkedFiles === 1 ? "" : "s"}`);
	}

	if (blockers.length > 0) {
		throw new ConflictError(
			`Cannot delete this file: it is still referenced by ${blockers.join(", ")}. ` +
				"Remove those references first.",
		);
	}

	try {
		await repo.remove(id);
	} catch (err) {
		throw mapSqliteError(err, "file");
	}

	// The row is gone, so the blob is now unreferenced and can be unlinked.
	await removeBlob(file.path);
}

/**
 * Paginated posts that reference this file.
 *
 * @param {number} id
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function listPosts(id, query) {
	await requireFile(id);
	const { page, limit } = normalisePaging(query.page, query.limit);
	const order = parseSort(query.sort, postRepo.POST_SORTABLE, "updated_at", "desc");

	const postIds = (await repo.postIdsAttached(id)).map(Number);
	if (postIds.length === 0) return { data: [], meta: buildMeta(page, limit, 0) };

	const { data, total } = await postRepo.pageRows(
		db("posts").whereIn("id", postIds),
		{ order, limit, offset: offsetFor(page, limit) },
	);

	return { data, meta: buildMeta(page, limit, total) };
}

/**
 * Paginated files directly linked to this file.
 *
 * @param {number} id
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function listRelatedFiles(id, query) {
	return listFileEdges(id, query, repo.idsOutbound);
}

/**
 * Files that link *to* this file — the "files pointing here" tab (SRS §8.4).
 *
 * @param {number} id
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function listReferencedFiles(id, query) {
	return listFileEdges(id, query, repo.idsInbound);
}

/**
 * Shared paging for the outbound and inbound file edge lists.
 *
 * @param {number} id
 * @param {Record<string, unknown>} query
 * @param {(fileId: number) => Promise<number[]>} pick
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
async function listFileEdges(id, query, pick) {
	await requireFile(id);
	const { page, limit } = normalisePaging(query.page, query.limit);
	const order = parseSort(query.sort, repo.FILE_SORTABLE, "created_at", "desc");

	const linkedIds = [...new Set(await pick(id))];
	if (linkedIds.length === 0) return { data: [], meta: buildMeta(page, limit, 0) };

	const { data, total } = await repo.pageRows(
		db("files").whereIn("id", linkedIds),
		order,
		limit,
		offsetFor(page, limit),
	);

	return { data, meta: buildMeta(page, limit, total) };
}

/**
 * Paginated files carrying a tag.
 *
 * @param {number} tagId
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ data: object[], meta: import('../../utils/query.js').PageMeta }>}
 */
export async function listByTag(tagId, query) {
	const { page, limit } = normalisePaging(query.page, query.limit);
	const order = parseSort(query.sort, repo.FILE_SORTABLE, "created_at", "desc");

	const { data, total } = await repo.listByTag(tagId, {
		order,
		limit,
		offset: offsetFor(page, limit),
	});

	return { data, meta: buildMeta(page, limit, total) };
}

/**
 * Link this file to another file.
 *
 * @param {number} id
 * @param {number} targetId
 * @returns {Promise<object>}
 */
export async function linkFile(id, targetId) {
	await requireFile(id);
	if (Number(id) === Number(targetId)) {
		throw new ValidationError("A file cannot link to itself", [
			{ field: "file", message: "Choose a different file" },
		]);
	}
	await requireFile(targetId);

	const existing = await db("files_files")
		.where({ from_file: id, to_file: Number(targetId) })
		.first("id");
	if (!existing) {
		await db("files_files").insert({
			from_file: id,
			to_file: Number(targetId),
		});
	}

	return get(id);
}

/**
 * Remove this file's outbound link to another file.
 *
 * Only the `id → targetId` edge is removed; an inbound link from `targetId` is
 * part of that file's outgoing set and is left alone (SRS §6.3).
 *
 * @param {number} id
 * @param {number} targetId
 * @returns {Promise<object>}
 */
export async function unlinkFile(id, targetId) {
	await requireFile(id);
	await db("files_files")
		.where({ from_file: Number(id), to_file: Number(targetId) })
		.delete();

	return get(id);
}

/**
 * Replace the whole file-to-file relation set of a file.
 *
 * @param {number} fileId
 * @param {Record<string, unknown[]>} relations - `{ files: [...] }`.
 * @returns {Promise<object[]>} The resulting related files.
 */
export async function replaceRelations(fileId, relations) {
	const targetIds = await resolveRefs("files", relations.files ?? [], {
		exclude: fileId,
	});

	await repo.replaceFileLinks(fileId, targetIds);

	if (targetIds.length === 0) return [];
	return db("files").whereIn("id", targetIds).select(repo.FILE_PICK_COLUMNS);
}

/**
 * Every file, most recent first. Used to populate picker options.
 *
 * @returns {Promise<object[]>}
 */
export async function options() {
	return db("files")
		.select(repo.FILE_PICK_COLUMNS)
		.orderBy("original_name", "asc");
}
