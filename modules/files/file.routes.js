/**
 * @file `/v1/json/files` — upload, browse, relate and delete files.
 * @module modules/files/file.routes
 */
import { Router } from "express";
import * as service from "./file.service.js";
import * as tagService from "../tags/tag.service.js";
import { listFilesQuerySchema, updateFileSchema } from "./file.schema.js";
import { subListQuerySchema } from "../categories/category.schema.js";
import { assignTagsSchema } from "../tags/tag.schema.js";
import { parseId } from "../../middleware/parseId.js";
import * as postService from "../posts/post.service.js";
import { resolveRef } from "../../utils/refs.js";
import { acceptUpload } from "../../middleware/upload.js";
import { absoluteBlobPath } from "../../utils/storage.js";
import { sendNoContent, sendOk, sendPage } from "../../middleware/respond.js";
import { validate } from "../../middleware/validate.js";
import {
	linkTagSchema,
	linkFileSchema,
	linkPostSchema,
	linkFileRelationSchema,
	linkPostToFileSchema,
} from "../../utils/relation.schema.js";

const router = Router();
// ── Collection ───────────────────────────────────────────────────────────────
/**
 * List files.
 */
router.get("/", async (req, res) => {
	const query = validate(listFilesQuerySchema, req.query);
	sendPage(res, await service.list(query));
});
/**
 * Upload a file.
 *
 * The response shape follows the upload state machine in SRS §7.1: `data` is the
 * file row itself and `deduplicated` sits beside it, so a client can tell a fresh
 * blob (`201`) from reused bytes (`200`) without unwrapping anything. Re-uploading
 * identical bytes is a hit, not a second row.
 */
router.post("/", acceptUpload(), async (req, res) => {
	const uploads = /** @type {Array<{path: string, originalname: string, mimetype: string, size: number}>} */ (
		req.uploads
	);
	const first = uploads[0];
	// Several files in one request (the post form attaches a cover plus its
	// attachments) is stored one at a time; the envelope describes the first file
	// and `files` carries the full set.
	if (uploads.length === 1) {
		const result = await service.store(first, {
			category: req.body?.category,
			tags: req.body?.tags,
			posts: req.body?.posts,
		});
		sendOk(res, result.file, {
			status: result.deduplicated ? 200 : 201,
			extra: { deduplicated: result.deduplicated },
		});
		return;
	}
	/** @type {object[]} */
	const files = [];
	let deduplicated = false;
	for (const upload of uploads) {
		const result = await service.store(upload, { category: req.body?.category });
		files.push(result.file);
		deduplicated = deduplicated || result.deduplicated;
	}
	sendOk(res, files, {
		status: deduplicated && files.length === 1 ? 200 : 201,
		extra: { deduplicated, files },
	});
});
/**
 * Download the blob as an attachment under its original filename.
 *
 * `res.download` sets `Content-Disposition: attachment`, which is what separates
 * this from reading `/storage/...` inline (acceptance criterion 8).
 */
router.get("/:id/download", parseId("id"), async (req, res) => {
	const file = await service.get(req.params.id);
	res.download(absoluteBlobPath(file.path), file.original_name);
});
// ── Single entity ────────────────────────────────────────────────────────────
/**
 * Read a file with its relations.
 */
router.get("/:id", parseId("id"), async (req, res) => {
	sendOk(res, await service.get(req.params.id));
});
/**
 * Update a file's category.
 */
router.patch("/:id", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const input = validate(updateFileSchema, req.body);
	sendOk(res, await service.update(id, input));
});
/**
 * Alias of `PATCH`, see the note in `category.routes.js`.
 */
router.put("/:id", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const input = validate(updateFileSchema, req.body);
	sendOk(res, await service.update(id, input));
});
/**
 * Delete a file row and its blob.
 */
router.delete("/:id", parseId("id"), async (req, res) => {
	await service.remove(req.params.id);
	sendNoContent(res);
});
// ── Relations ────────────────────────────────────────────────────────────────
/**
 * Posts referencing this file.
 */
router.get("/:id/posts", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const query = validate(subListQuerySchema, req.query);
	sendPage(res, await service.listPosts(id, query));
});
/**
 * Files this file links to — the outbound edge list.
 */
router.get("/:id/related", parseId("id"), async (req, res) => {
	const query = validate(subListQuerySchema, req.query);
	sendPage(res, await service.listRelatedFiles(req.params.id, query));
});
/**
 * Files that link to this file — the inbound edge list.
 *
 * Separate from `/:id/related` on purpose: SRS §8.4 forbids merging the two
 * directions into a single "related" set.
 */
router.get("/:id/referenced", parseId("id"), async (req, res) => {
	const query = validate(subListQuerySchema, req.query);
	sendPage(res, await service.listReferencedFiles(req.params.id, query));
});
/**
 * Create the outbound edge `:id → to_file`. Body: `{ "to_file": <id or name> }`.
 */
router.post("/:id/related", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const { to_file: toFile } = validate(linkFileRelationSchema, req.body ?? {});
	// No `exclude`: a self-link is caught by `linkFile`, which explains it.
	sendOk(res, await service.linkFile(id, await resolveRef("files", toFile)), { status: 201 });
});
/**
 * Remove the outbound edge `:id → :fileId`.
 */
router.delete("/:id/related/:fileId", parseId("id"), parseId("fileId"), async (req, res) => {
	await service.unlinkFile(req.params.id, req.params.fileId);
	sendNoContent(res);
});
/**
 * Attach an existing post to this file. Body: `{ "post": <id or title> }`.
 */
router.post("/:id/posts", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const { post } = validate(linkPostToFileSchema, req.body ?? {});
	sendOk(res, await postService.attachFile(await resolveRef("posts", post), id), { status: 201 });
});
/**
 * Replace the whole file-to-file relation set.
 */
router.put("/:id/relations", parseId("id"), async (req, res) => {
	const id = req.params.id;
	sendOk(res, await service.replaceRelations(id, req.body ?? {}));
});
// ── Tags ─────────────────────────────────────────────────────────────────────
/**
 * Tags on this file.
 */
router.get("/:id/tags", parseId("id"), async (req, res) => {
	sendOk(res, await tagService.forFile(req.params.id));
});
/**
 * Replace this file's tags.
 */
router.put("/:id/tags", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const { tags } = validate(assignTagsSchema, req.body ?? {});
	sendOk(res, await tagService.assignToFile(id, tags ?? []));
});
/**
 * Add one tag to this file. Body: `{ "tag": <id or name> }`.
 *
 * Adds rather than replaces, so an existing tag set survives.
 */
router.post("/:id/tags", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const { tag } = validate(linkTagSchema, req.body ?? {});
	sendOk(res, await tagService.addToFile(id, await resolveRef("tags", tag)), { status: 201 });
});
/**
 * Remove one tag from this file.
 */
router.delete("/:id/tags/:tagId", parseId("id"), parseId("tagId"), async (req, res) => {
	const id = req.params.id;
	const tagId = req.params.tagId;
	await tagService.removeFromFile(id, tagId);
	sendNoContent(res);
});
export default router;