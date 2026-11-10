/**
 * @file `/v1/web/tags` — the tag screens.
 *
 * Tags are flat, so a single list page and a small form cover the whole module.
 * Tag assignment happens on the post and file screens.
 *
 * @module modules/tags/tag.web.routes
 */

import { Router } from "express";

import * as service from "./tag.service.js";
import {
	createTagSchema,
	listTagsQuerySchema,
	updateTagSchema,
} from "./tag.schema.js";
import { parseId } from "../../middleware/parseId.js";
import { reRenderWithErrors } from "../../middleware/respond.js";
import { validate } from "../../middleware/validate.js";

const router = Router();

/** Where the user lands after a create or update. */
const LIST_URL = "/v1/web/tags";

/**
 * Tag list with counts, search and sort.
 */
router.get("/", async (req, res) => {
	const query = validate(listTagsQuerySchema, req.query);
	const { data, meta } = await service.list({ ...query, limit: 100 });

	res.render("tags/index", {
		title: "Tags",
		activeNav: "tags",
		tags: data,
		meta,
	});
});

/**
 * The create form.
 */
router.get("/new", async (_req, res) => {
	res.render("tags/form", {
		title: "New tag",
		activeNav: "tags",
		values: {},
	});
});

/**
 * Create a tag.
 */
router.post("/", async (req, res, next) => {
	let input;
	try {
		input = validate(createTagSchema, req.body);
	} catch (err) {
		reRenderWithErrors(err, req, res, next, {
			view: "tags/form",
			title: "New tag",
			activeNav: "tags",
		});
		return;
	}

	try {
		const tag = await service.create(input);
		req.flash("success", `Created “${tag.name}”`);
		res.redirect(`${LIST_URL}/${tag.id}`);
	} catch (err) {
		next(err);
	}
});

/**
 * A tag and the things carrying it.
 */
router.get("/:id", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const tag = await service.get(id);
	const [posts, files] = await Promise.all([
		service.listPosts(id, { page: 1, limit: 25 }),
		service.listFiles(id, { page: 1, limit: 25 }),
	]);

	res.render("tags/show", {
		title: tag.name,
		activeNav: "tags",
		tag,
		posts: posts.data,
		files: files.data,
	});
});

/**
 * The edit form.
 */
router.get("/:id/edit", parseId("id"), async (req, res) => {
	const tag = await service.requireTag(req.params.id);
	res.render("tags/form", {
		title: `Edit ${tag.name}`,
		activeNav: "tags",
		values: tag,
	});
});

/**
 * Rename a tag.
 */
const updateTag = async (req, res, next) => {
	const id = req.params.id;

	let input;
	try {
		input = validate(updateTagSchema, req.body);
	} catch (err) {
		reRenderWithErrors(err, req, res, next, {
			view: "tags/form",
			title: "Edit tag",
			activeNav: "tags",
			values: { ...req.body, id },
		});
		return;
	}

	try {
		const tag = await service.update(id, input);
		req.flash("success", `Saved “${tag.name}”`);
		res.redirect(`${LIST_URL}/${tag.id}`);
	} catch (err) {
		next(err);
	}
}

// A plain POST for no-JS forms, and PUT for `_method=PUT`.
router.post("/:id", parseId("id"), updateTag);
router.put("/:id", parseId("id"), updateTag);

/**
 * Delete a tag.
 */
const deleteTag = async (req, res) => {
	const id = req.params.id;

	try {
		await service.remove(id);
		req.flash("success", "Tag deleted");
		res.redirect(LIST_URL);
	} catch (err) {
		req.flash("error", err?.message ?? "Could not delete that tag");
		res.redirect(`${LIST_URL}/${id}`);
	}
};

// Both spellings: a plain POST for no-JS forms, and DELETE for `_method=DELETE`.
router.post("/:id/delete", parseId("id"), deleteTag);
router.delete("/:id", parseId("id"), deleteTag);

export default router;
