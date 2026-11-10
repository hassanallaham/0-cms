/**
 * @file `/v1/web/categories` — the category screens.
 *
 * Each write is POST-then-redirect, so a refresh never re-submits. Deletion goes
 * through `_method=DELETE` (see `app.js`), because a browser form only speaks
 * GET and POST.
 *
 * @module modules/categories/category.web.routes
 */

import { Router } from "express";

import * as service from "./category.service.js";
import {
	createCategorySchema,
	listCategoriesQuerySchema,
	updateCategorySchema,
} from "./category.schema.js";
import { parseId } from "../../middleware/parseId.js";
import { reRenderWithErrors } from "../../middleware/respond.js";
import { validate } from "../../middleware/validate.js";

const router = Router();

/** Where the user lands after a create or update. */
const LIST_URL = "/v1/web/categories";

/**
 * Options every category form needs: the full category list for the parent
 * picker, minus the one being edited so it cannot become its own parent.
 *
 * @param {number} [excludeId]
 * @returns {Promise<object[]>}
 */
async function formOptions(excludeId) {
	const all = await service.options();
	return excludeId
		? all.filter((row) => Number(row.id) !== Number(excludeId))
		: all;
}

/**
 * Category list, with search, root filter and sort.
 */
router.get("/", async (req, res) => {
	const query = validate(listCategoriesQuerySchema, req.query);
	const { data, meta } = await service.list({ ...query, limit: 50 });

	res.render("categories/index", {
		title: "Categories",
		activeNav: "categories",
		categories: data,
		meta,
	});
});

/**
 * The create form.
 */
router.get("/new", async (_req, res) => {
	res.render("categories/form", {
		title: "New category",
		activeNav: "categories",
		values: {},
		parents: await formOptions(),
	});
});

/**
 * Create a category.
 */
router.post("/", async (req, res, next) => {
	let input;
	try {
		input = validate(createCategorySchema, req.body);
	} catch (err) {
		reRenderWithErrors(err, req, res, next, {
			view: "categories/form",
			title: "New category",
			activeNav: "categories",
		});
		return;
	}

	try {
		const category = await service.create(input);
		req.flash("success", `Created “${category.name}”`);
		res.redirect(`${LIST_URL}/${category.id}`);
	} catch (err) {
		next(err);
	}
});

/**
 * A category and everything it contains.
 */
router.get("/:id", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const category = await service.get(id);
	const [children, posts, files] = await Promise.all([
		service.listChildren(id, { page: 1, limit: 50 }),
		service.listPosts(id, { page: 1, limit: 10 }),
		service.listFiles(id, { page: 1, limit: 10 }),
	]);

	res.render("categories/show", {
		title: category.name,
		activeNav: "categories",
		category,
		children: children.data,
		posts: posts.data,
		files: files.data,
	});
});

/**
 * The edit form.
 */
router.get("/:id/edit", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const category = await service.get(id);

	res.render("categories/form", {
		title: `Edit ${category.name}`,
		activeNav: "categories",
		values: category,
		parents: await formOptions(id),
	});
});

/**
 * Update a category.
 */
const updateCategory = async (req, res, next) => {
	const id = req.params.id;

	let input;
	try {
		input = validate(updateCategorySchema, req.body);
	} catch (err) {
		reRenderWithErrors(err, req, res, next, {
			view: "categories/form",
			title: "Edit category",
			activeNav: "categories",
			values: { ...req.body, id },
		});
		return;
	}

	try {
		const category = await service.update(id, input);
		req.flash("success", `Saved “${category.name}”`);
		res.redirect(`${LIST_URL}/${category.id}`);
	} catch (err) {
		next(err);
	}
};

// A plain POST for no-JS forms, and PUT for `_method=PUT`.
router.post("/:id", parseId("id"), updateCategory);
router.put("/:id", parseId("id"), updateCategory);

/**
 * Delete a category.
 */
const deleteCategory = async (req, res) => {
	const id = req.params.id;

	try {
		await service.remove(id);
		req.flash("success", "Category deleted");
		res.redirect(LIST_URL);
	} catch (err) {
		req.flash("error", err?.message ?? "Could not delete that category");
		res.redirect(`${LIST_URL}/${id}`);
	}
};

// Both spellings: a plain POST for no-JS forms, and DELETE for `_method=DELETE`.
router.post("/:id/delete", parseId("id"), deleteCategory);
router.delete("/:id", parseId("id"), deleteCategory);

export default router;
