/**
 * @file `/v1/web/files` — the file screens: library, upload, detail.
 *
 * @module modules/files/file.web.routes
 */
import { Router } from "express";
import * as service from "./file.service.js";
import * as categoryService from "../categories/category.service.js";
import * as tagService from "../tags/tag.service.js";
import * as postService from "../posts/post.service.js";
import { listFilesQuerySchema, updateFileSchema } from "./file.schema.js";
import { parseId } from "../../middleware/parseId.js";
import { acceptUpload } from "../../middleware/upload.js";
import { config } from "../../config/index.js";
import { blobUrl } from "../../utils/storage.js";
import { validate } from "../../middleware/validate.js";
import { resolveRef } from "../../utils/refs.js";
import {
	linkTagSchema,
	linkFileSchema,
	linkPostSchema,
	linkFileRelationSchema,
	linkPostToFileSchema,
} from "../../utils/relation.schema.js";

const router = Router();
/** Where the user lands after an upload or a delete. */
const LIST_URL = "/v1/web/files";
/**
 * The file library.
 */
router.get("/", async (req, res) => {
	const query = validate(listFilesQuerySchema, req.query);
	const { data, meta } = await service.list(query);
	res.render("files/index", {
		title: "Files",
		activeNav: "files",
		files: data.map((file) => ({ ...file, url: blobUrl(file.path) })),
		meta,
		allowedMime: config.files.allowedMime,
		maxMb: config.files.maxMb,
	});
});
/**
 * The upload screen.
 */
router.get("/new", async (_req, res) => {
	res.render("files/upload", {
		title: "Upload files",
		activeNav: "files",
		categories: await categoryService.options(),
		allowedMime: config.files.allowedMime,
		maxMb: config.files.maxMb,
	});
});
/**
 * Upload files.
 *
 * Every blob is stored independently: one rejected file in a batch does not
 * discard the others, and the failures are reported one by one.
 */
router.post("/", acceptUpload(), async (req, res) => {
	const uploads = /** @type {Array<object>} */ (req.uploads ?? []);
	/** @type {string[]} */
	const failures = [];
	/** @type {object|null} */
	let last = null;
	let stored = 0;
	let deduplicated = 0;
	for (const upload of uploads) {
		try {
			const result = await service.store(upload, { category: req.body?.category });
			stored += 1;
			last = result.file;
			if (result.deduplicated) deduplicated += 1;
		} catch (err) {
			failures.push(err?.message ?? String(err));
		}
	}
	if (stored > 0) {
		req.flash(
			"success",
			`Stored ${stored} file${stored === 1 ? "" : "s"}` +
				(deduplicated > 0 ? ` (${deduplicated} already existed)` : ""),
		);
	}
	for (const failure of failures) {
		req.flash("error", failure);
	}
	// Land on the uploaded file so its tag, post and file pickers are one click away —
	// that is where the relations live, and a plain list page offers none (SRS §13.6).
	res.redirect(last ? `${LIST_URL}/${last.id}` : LIST_URL);
});
/**
 * A file and everything that references it.
 */
router.get("/:id", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const file = await service.get(id);
	const [tags, posts, categories, allTags, allFiles] = await Promise.all([
		tagService.forFile(id),
		service.listPosts(id, { page: 1, limit: 25 }),
		categoryService.options(),
		tagService.options(),
		service.options(),
	]);
	res.render("files/show", {
		title: file.original_name,
		activeNav: "files",
		file: { ...file, url: blobUrl(file.path) },
		tags,
		posts: posts.data,
		categories,
		options: {
			tags: allTags,
			posts: await postService.options(),
			// A file cannot point at itself, so the file being viewed leaves its
			// own picker — enforced here because the dashboard works without JS.
			files: allFiles.filter((row) => Number(row.id) !== Number(id)),
		},
	});
});
/**
 * Update a file's category from the detail page. Field: `category`.
 */
const updateFile = async (req, res, next) => {
	const id = req.params.id;
	try {
		const input = validate(updateFileSchema, req.body ?? {});
		await service.update(id, input);
		req.flash("success", "File updated");
	} catch (err) {
		req.flash("error", err?.message ?? "Could not update that file");
	}
	res.redirect(`${LIST_URL}/${id}`);
}

// A plain POST for no-JS forms, and PUT for `_method=PUT`.
router.post("/:id", parseId("id"), updateFile);
router.put("/:id", parseId("id"), updateFile);
/**
 * Delete a file and its blob.
 */
const deleteFile = async (req, res) => {
	const id = req.params.id;
	try {
		await service.remove(id);
		req.flash("success", "File deleted");
		res.redirect(LIST_URL);
	} catch (err) {
		req.flash("error", err?.message ?? "Could not delete that file");
		res.redirect(`${LIST_URL}/${id}`);
	}
};

// Both spellings: a plain POST for no-JS forms, and DELETE for `_method=DELETE`.
router.post("/:id/delete", parseId("id"), deleteFile);
router.delete("/:id", parseId("id"), deleteFile);
// ── Relations ────────────────────────────────────────────────────────────────
/**
 * Attach this file to a post. Field: `post` (an id, or a title to resolve).
 */
router.post("/:id/posts", parseId("id"), async (req, res) => {
	const id = req.params.id;
	try {
		const input = validate(linkPostToFileSchema, req.body ?? {});
		await postService.attachFile(await resolveRef("posts", input.post), id);
		req.flash("success", "Attached to post");
	} catch (err) {
		req.flash("error", err?.message ?? "Could not attach to that post");
	}
	res.redirect(`${LIST_URL}/${id}`);
});
/**
 * Detach this file from a post.
 */
router.post("/:id/posts/:postId/detach", parseId("id"), parseId("postId"), async (req, res) => {
	const id = req.params.id;
	const postId = req.params.postId;
	await postService.detachFile(postId, id);
	req.flash("success", "Detached from post");
	res.redirect(`${LIST_URL}/${id}`);
});
/**
 * Link this file to another file. Field: `to_file` (an id, or a name to resolve).
 */
router.post("/:id/files", parseId("id"), async (req, res) => {
	const id = req.params.id;
	try {
		const input = validate(linkFileRelationSchema, req.body ?? {});
		await service.linkFile(id, await resolveRef("files", input.to_file));
		req.flash("success", "File linked");
	} catch (err) {
		req.flash("error", err?.message ?? "Could not link that file");
	}
	res.redirect(`${LIST_URL}/${id}`);
});
/**
 * Unlink a file-to-file relation.
 */
router.post("/:id/files/:targetId/unlink", parseId("id"), parseId("targetId"), async (req, res) => {
	const id = req.params.id;
	const targetId = req.params.targetId;
	await service.unlinkFile(id, targetId);
	req.flash("success", "File unlinked");
	res.redirect(`${LIST_URL}/${id}`);
});
/**
 * Add a tag to this file. Field: `tag` (an id, or a name to resolve).
 */
router.post("/:id/tags", parseId("id"), async (req, res) => {
	const id = req.params.id;
	try {
		const input = validate(linkTagSchema, req.body ?? {});
		await tagService.addToFile(id, await tagService.resolveOrCreateTag(input.tag));
		req.flash("success", "Tag added");
	} catch (err) {
		req.flash("error", err?.message ?? "Could not add that tag");
	}
	res.redirect(`${LIST_URL}/${id}`);
});
/**
 * Remove a tag from this file.
 */
router.post("/:id/tags/:tagId/remove", parseId("id"), parseId("tagId"), async (req, res) => {
	const id = req.params.id;
	const tagId = req.params.tagId;
	await tagService.removeFromFile(id, tagId);
	req.flash("success", "Tag removed");
	res.redirect(`${LIST_URL}/${id}`);
});
export default router;