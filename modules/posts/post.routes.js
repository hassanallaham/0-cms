/**
 * @file `/v1/json/posts` — post CRUD, relations and tags.
 * @module modules/posts/post.routes
 */
import { Router } from "express";
import * as service from "./post.service.js";
import * as tagService from "../tags/tag.service.js";
import {
	createPostSchema,
	listPostsQuerySchema,
	updatePostSchema,
} from "./post.schema.js";
import { subListQuerySchema } from "../categories/category.schema.js";
import { assignTagsSchema } from "../tags/tag.schema.js";
import { parseId } from "../../middleware/parseId.js";
import { resolveRef } from "../../utils/refs.js";
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
 * List posts.
 */
router.get("/", async (req, res) => {
	const query = validate(listPostsQuerySchema, req.query);
	sendPage(res, await service.list(query));
});
/**
 * Create a post.
 */
router.post("/", async (req, res) => {
	const input = validate(createPostSchema, req.body);
	sendOk(res, await service.create(input), { status: 201 });
});
// ── Single entity ────────────────────────────────────────────────────────────
/**
 * Read a post with its relations.
 */
router.get("/:id", parseId("id"), async (req, res) => {
	sendOk(res, await service.get(req.params.id));
});
/**
 * Read a post with its content rendered to HTML.
 *
 * Separate from `GET /:id` so a caller that only wants the raw row does not pay
 * for Markdown rendering.
 */
router.get("/:id/rendered", parseId("id"), async (req, res) => {
	sendOk(res, await service.getRendered(req.params.id));
});
/**
 * Partially update a post.
 */
router.patch("/:id", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const input = validate(updatePostSchema, req.body);
	sendOk(res, await service.update(id, input));
});
/**
 * Alias of `PATCH`, see the note in `category.routes.js`.
 */
router.put("/:id", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const input = validate(updatePostSchema, req.body);
	sendOk(res, await service.update(id, input));
});
/**
 * Delete a post and its relation rows.
 */
router.delete("/:id", parseId("id"), async (req, res) => {
	await service.remove(req.params.id);
	sendNoContent(res);
});
// ── Relations ────────────────────────────────────────────────────────────────
/**
 * Files linked to this post.
 */
router.get("/:id/files", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const query = validate(subListQuerySchema, req.query);
	sendPage(res, await service.listFiles(id, query));
});
/**
 * Link a file to this post. Body: `{ "file": <id or name> }`.
 */
router.post("/:id/files", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const { file } = validate(linkFileSchema, req.body ?? {});
	sendOk(res, await service.attachFile(id, await resolveRef("files", file)), { status: 201 });
});
/**
 * Unlink a file from this post.
 */
router.delete("/:id/files/:fileId", parseId("id"), parseId("fileId"), async (req, res) => {
	const id = req.params.id;
	const fileId = req.params.fileId;
	await service.detachFile(id, fileId);
	sendNoContent(res);
});
/**
 * Posts this post links to — the outbound edge list.
 */
router.get("/:id/related", parseId("id"), async (req, res) => {
	const query = validate(subListQuerySchema, req.query);
	sendPage(res, await service.listRelatedPosts(req.params.id, query));
});
/**
 * Posts that link to this post — the inbound edge list.
 *
 * Kept separate from `/:id/related` on purpose: SRS §8.4 requires the two
 * directions to stay distinct rather than being merged into one "related" set.
 */
router.get("/:id/referenced", parseId("id"), async (req, res) => {
	const query = validate(subListQuerySchema, req.query);
	sendPage(res, await service.listReferencedPosts(req.params.id, query));
});
/**
 * Create the outbound edge `:id → to_post`. Body: `{ "to_post": <id or name> }`.
 */
router.post("/:id/related", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const { to_post: toPost } = validate(linkPostSchema, req.body ?? {});
	// Resolved without `exclude` so that a self-link reaches `linkPost`, which
	// reports it as such rather than as an unresolvable name.
	sendOk(res, await service.linkPost(id, await resolveRef("posts", toPost)), { status: 201 });
});
/**
 * Remove the outbound edge `:id → :postId`.
 *
 * An inbound edge from `:postId` is untouched — it belongs to that post.
 */
router.delete("/:id/related/:postId", parseId("id"), parseId("postId"), async (req, res) => {
	await service.unlinkPost(req.params.id, req.params.postId);
	sendNoContent(res);
});
/**
 * Replace the whole relation set in one call.
 *
 * Body: `{ "posts": [1, 2], "files": [7] }` — ids or names.
 */
router.put("/:id/relations", parseId("id"), async (req, res) => {
	const id = req.params.id;
	sendOk(res, await service.replaceRelations(id, req.body ?? {}));
});
// ── Tags ─────────────────────────────────────────────────────────────────────
/**
 * Tags on this post.
 */
router.get("/:id/tags", parseId("id"), async (req, res) => {
	sendOk(res, await tagService.forPost(req.params.id));
});
/**
 * Replace this post's tags.
 */
router.put("/:id/tags", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const { tags } = validate(assignTagsSchema, req.body ?? {});
	sendOk(res, await tagService.assignToPost(id, tags ?? []));
});
/**
 * Add one tag to this post. Body: `{ "tag": <id or name> }`.
 *
 * Adds rather than replaces: an existing tag set survives, so two callers racing
 * to tag the same post cannot erase each other's work.
 */
router.post("/:id/tags", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const { tag } = validate(linkTagSchema, req.body ?? {});
	sendOk(res, await tagService.addToPost(id, await resolveRef("tags", tag)), { status: 201 });
});
/**
 * Remove one tag from this post.
 */
router.delete("/:id/tags/:tagId", parseId("id"), parseId("tagId"), async (req, res) => {
	const id = req.params.id;
	const tagId = req.params.tagId;
	await tagService.removeFromPost(id, tagId);
	sendNoContent(res);
});
export default router;