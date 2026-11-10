/**
 * @file `/v1/json/tags` — tag CRUD and its assignments.
 * @module modules/tags/tag.routes
 */

import { Router } from "express";

import * as service from "./tag.service.js";
import {
	createTagSchema,
	listTagsQuerySchema,
	updateTagSchema,
} from "./tag.schema.js";
import { subListQuerySchema } from "../categories/category.schema.js";
import { parseId } from "../../middleware/parseId.js";
import { sendNoContent, sendOk, sendPage } from "../../middleware/respond.js";
import { validate } from "../../middleware/validate.js";

const router = Router();

// ── Collection ───────────────────────────────────────────────────────────────

/**
 * List tags.
 */
router.get("/", async (req, res) => {
	const query = validate(listTagsQuerySchema, req.query);
	sendPage(res, await service.list(query));
});

/**
 * Create a tag.
 */
router.post("/", async (req, res) => {
	const input = validate(createTagSchema, req.body);
	sendOk(res, await service.create(input), { status: 201 });
});

// ── Single entity ────────────────────────────────────────────────────────────

/**
 * Read a tag with its post and file counts.
 */
router.get("/:id", parseId("id"), async (req, res) => {
	sendOk(res, await service.get(req.params.id));
});

/**
 * Rename a tag.
 */
router.patch("/:id", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const input = validate(updateTagSchema, req.body);
	sendOk(res, await service.update(id, input));
});

/**
 * Alias of `PATCH`, see the note in `category.routes.js`.
 */
router.put("/:id", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const input = validate(updateTagSchema, req.body);
	sendOk(res, await service.update(id, input));
});

/**
 * Delete a tag and all of its assignments.
 */
router.delete("/:id", parseId("id"), async (req, res) => {
	await service.remove(req.params.id);
	sendNoContent(res);
});

// ── Sub-collections ──────────────────────────────────────────────────────────

/**
 * Posts carrying this tag.
 */
router.get("/:id/posts", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const query = validate(subListQuerySchema, req.query);
	sendPage(res, await service.listPosts(id, query));
});

/**
 * Files carrying this tag.
 */
router.get("/:id/files", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const query = validate(subListQuerySchema, req.query);
	sendPage(res, await service.listFiles(id, query));
});

/**
 * Attach this tag to a post.
 */
router.post("/:id/posts/:postId", parseId("id"), parseId("postId"), async (req, res) => {
	const id = req.params.id;
	const postId = req.params.postId;
	sendOk(res, await service.assignToPost(postId, { tags: id }));
});

/**
 * Detach this tag from a post, leaving the post's other tags alone.
 */
router.delete("/:id/posts/:postId", parseId("id"), parseId("postId"), async (req, res) => {
	const id = req.params.id;
	const postId = req.params.postId;
	await service.removeFromPost(postId, id);
	sendNoContent(res);
});

/**
 * Attach this tag to a file.
 */
router.post("/:id/files/:fileId", parseId("id"), parseId("fileId"), async (req, res) => {
	const id = req.params.id;
	const fileId = req.params.fileId;
	sendOk(res, await service.assignToFile(fileId, { tags: id }));
});

/**
 * Detach this tag from a file, leaving the file's other tags alone.
 */
router.delete("/:id/files/:fileId", parseId("id"), parseId("fileId"), async (req, res) => {
	const id = req.params.id;
	const fileId = req.params.fileId;
	await service.removeFromFile(fileId, id);
	sendNoContent(res);
});

export default router;
