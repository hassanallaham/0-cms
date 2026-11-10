/**
 * @file `/v1/web/posts` — the post screens: list, editor, preview, relations.
 *
 * The editor posts to the same service layer the JSON API uses; only the
 * presentation and the redirect differ.
 *
 * @module modules/posts/post.web.routes
 */
import { Router } from "express";
import * as service from "./post.service.js";
import * as categoryService from "../categories/category.service.js";
import * as typeService from "../types/type.service.js";
import * as tagService from "../tags/tag.service.js";
import * as fileService from "../files/file.service.js";
import {
	createPostSchema,
	listPostsQuerySchema,
	POST_STATUSES,
	updatePostSchema,
} from "./post.schema.js";
import { parseId } from "../../middleware/parseId.js";
import { resolveRef } from "../../utils/refs.js";
import { config } from "../../config/index.js";
import { acceptUpload } from "../../middleware/upload.js";
import { reRenderWithErrors } from "../../middleware/respond.js";
import { validate } from "../../middleware/validate.js";
import {
	linkTagSchema,
	linkFileSchema,
	linkPostSchema,
	linkFileRelationSchema,
	linkPostToFileSchema,
} from "../../utils/relation.schema.js";

const router = Router();
/** Where the user lands after a create or update. */
const LIST_URL = "/v1/web/posts";
/**
 * Everything the editor needs: pickers for every relation.
 *
 * @param {number} [excludeId] - The post being edited, dropped from the post picker.
 * @returns {Promise<Record<string, object[]>>}
 */
async function formOptions(excludeId) {
	const [categories, types, tags, files, posts] = await Promise.all([
		categoryService.options(),
		typeService.options(),
		tagService.options(),
		fileService.options(),
		service.options(),
	]);
	// A post cannot point at itself, so the post being edited leaves its own picker.
	return {
		categories,
		types,
		tags,
		files,
		posts: excludeId
			? posts.filter((row) => Number(row.id) !== Number(excludeId))
			: posts,
	};
}
/**
 * Locals shared by the create form, the edit form, and a rejected submit.
 *
 * `photoPreview` exists so the cover hint can name the file instead of leaking
 * the raw id it is stored as (SRS §5).
 *
 * @param {{ id?: number, photo?: string | null }} [values]
 * @returns {Promise<Record<string, unknown>>}
 */
async function formLocals(values = {}) {
	let photoPreview = "";
	if (values.photo) {
		const photo = await fileService.getByPath(values.photo).catch(() => null);
		photoPreview = photo ? photo.original_name : "";
	}

	return {
		statuses: POST_STATUSES,
		markdownTypes: config.ui.markdownTypes,
		options: await formOptions(values.id),
		photoPreview,
	};
}

/**
 * Post list with search, status filter and sort.
 */
router.get("/", async (req, res) => {
	const query = validate(listPostsQuerySchema, req.query);
	const { data, meta } = await service.list(query);
	res.render("posts/index", {
		title: "Posts",
		activeNav: "posts",
		posts: data,
		meta,
		statusFilter: query.status ?? "",
	});
});
/**
 * The create form.
 */
router.get("/new", async (_req, res) => {
	res.render("posts/form", {
		title: "New post",
		activeNav: "posts",
		values: { status: "draft", relations: { posts: [], files: [] } },
		...(await formLocals()),
	});
});
/**
 * Create a post, optionally uploading a cover image at the same time.
 */
router.post("/", acceptUpload({ required: false }), async (req, res, next) => {
	let input;
	try {
		input = validate(createPostSchema, req.body);
	} catch (err) {
		reRenderWithErrors(err, req, res, next, {
			view: "posts/form",
			title: "New post",
			activeNav: "posts",
			locals: await formLocals(),
		});
		return;
	}
	try {
		let post = await service.create(input);
		// The cover image arrives with the form; store it, then point the post at it.
		const uploads = req.uploads ?? [];
		if (uploads.length > 0) {
			const { file } = await fileService.store(uploads[0], {
				category: input.category,
			});
			post = await service.update(post.id, { photo: file.path });
		}
		req.flash("success", `Created “${post.title}”`);
		res.redirect(`${LIST_URL}/${post.id}`);
	} catch (err) {
		next(err);
	}
});
/**
 * Read a post.
 */
router.get("/:id", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const post = await service.getRendered(id);
	res.render("posts/show", {
		title: post.title,
		activeNav: "posts",
		post,
		// Excluded here as well as by the picker script: this dashboard is
		// server-rendered and works without JavaScript, so offering the post as a
		// link target would hand the user an option that can only fail.
		options: await formOptions(id),
	});
});
/**
 * The edit form.
 */
router.get("/:id/edit", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const post = await service.get(id);
	const tags = await tagService.forPost(id);
	res.render("posts/form", {
		title: `Edit ${post.title}`,
		activeNav: "posts",
		values: {
			...post,
			tags: tags.map((tag) => tag.id),
			relations: {
				posts: post.related_posts.map((row) => row.id),
				files: post.related_files.map((row) => row.id),
			},
		},
		...(await formLocals(post)),
	});
});
/**
 * Update a post.
 */
const updatePost = async (req, res, next) => {
	const id = req.params.id;
	let input;
	try {
		input = validate(updatePostSchema, req.body);
	} catch (err) {
		reRenderWithErrors(err, req, res, next, {
			view: "posts/form",
			title: "Edit post",
			activeNav: "posts",
			values: { ...req.body, id },
			locals: await formLocals({ id, photo: req.body.photo }),
		});
		return;
	}
	try {
		let post = await service.update(id, input);
		const uploads = req.uploads ?? [];
		if (uploads.length > 0) {
			const { file } = await fileService.store(uploads[0], {
				category: post.category,
			});
			post = await service.update(id, { photo: file.path });
		}
		// Tags are submitted as free text; unknown names create the tag.
		if (req.body.tags !== undefined) {
			await tagService.assignToPost(id, req.body.tags);
		}
		req.flash("success", `Saved “${post.title}”`);
		res.redirect(`${LIST_URL}/${id}`);
	} catch (err) {
		next(err);
	}
}

// A plain POST for no-JS forms, and PUT for `_method=PUT`.
router.post("/:id", parseId("id"), acceptUpload({ required: false }), updatePost);
router.put("/:id", parseId("id"), acceptUpload({ required: false }), updatePost);
/**
 * Delete a post.
 */
const deletePost = async (req, res) => {
	const id = req.params.id;
	try {
		await service.remove(id);
		req.flash("success", "Post deleted");
		res.redirect(LIST_URL);
	} catch (err) {
		req.flash("error", err?.message ?? "Could not delete that post");
		res.redirect(`${LIST_URL}/${id}`);
	}
};

// Both spellings: a plain POST for no-JS forms, and DELETE for `_method=DELETE`.
router.post("/:id/delete", parseId("id"), deletePost);
router.delete("/:id", parseId("id"), deletePost);
// ── Relations ────────────────────────────────────────────────────────────────
/**
 * Attach a file, chosen by picker. Field: `file` (an id, or a name to resolve).
 */
router.post("/:id/files", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const input = validate(linkFileSchema, req.body ?? {});
	try {
		await service.attachFile(id, await resolveRef("files", input.file));
		req.flash("success", "File attached");
	} catch (err) {
		req.flash("error", err?.message ?? "Could not attach that file");
	}
	res.redirect(`${LIST_URL}/${id}`);
});
/**
 * Unlink a file from this post.
 */
router.post("/:id/files/:fileId/detach", parseId("id"), parseId("fileId"), async (req, res) => {
	const id = req.params.id;
	const fileId = req.params.fileId;
	await service.detachFile(id, fileId);
	req.flash("success", "File detached");
	res.redirect(`${LIST_URL}/${id}`);
});
/**
 * Link to another post, chosen by picker. Field: `post` (an id, or a title).
 *
 * Creates the outbound edge `:id → post`; the target does not gain a reciprocal
 * edge, which is why the detail page keeps "related" and "pointing here" apart.
 */
router.post("/:id/posts", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const input = validate(linkPostSchema, req.body ?? {});
	try {
		await service.linkPost(id, await resolveRef("posts", input.to_post ?? input.post));
		req.flash("success", "Post linked");
	} catch (err) {
		req.flash("error", err?.message ?? "Could not link that post");
	}
	res.redirect(`${LIST_URL}/${id}`);
});
/**
 * Unlink a post-to-post relation.
 */
router.post("/:id/posts/:targetId/unlink", parseId("id"), parseId("targetId"), async (req, res) => {
	const id = req.params.id;
	const targetId = req.params.targetId;
	await service.unlinkPost(id, targetId);
	req.flash("success", "Post unlinked");
	res.redirect(`${LIST_URL}/${id}`);
});
/**
 * Add a tag, chosen by picker. Field: `tag` (an id, or a name to resolve).
 */
router.post("/:id/tags", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const input = validate(linkTagSchema, req.body ?? {});
	try {
		await tagService.addToPost(id, await tagService.resolveOrCreateTag(input.tag));
		req.flash("success", "Tag added");
	} catch (err) {
		req.flash("error", err?.message ?? "Could not add that tag");
	}
	res.redirect(`${LIST_URL}/${id}`);
});
/**
 * Remove a tag from this post.
 */
router.post("/:id/tags/:tagId/remove", parseId("id"), parseId("tagId"), async (req, res) => {
	const id = req.params.id;
	const tagId = req.params.tagId;
	await tagService.removeFromPost(id, tagId);
	req.flash("success", "Tag removed");
	res.redirect(`${LIST_URL}/${id}`);
});
export default router;