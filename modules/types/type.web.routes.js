/**
 * @file `/v1/web/types` — the type list and its forms.
 *
 * Types are editable like any other entity (SRS §8.3), so this module carries the
 * same three screens as the others: list, form, detail. The form is two fields,
 * because `types` is the only table with no description, photo or timestamps.
 *
 * @module modules/types/type.web.routes
 */

import { Router } from "express";

import * as service from "./type.service.js";
import { createTypeSchema, listTypesQuerySchema, updateTypeSchema } from "./type.schema.js";
import { subListQuerySchema } from "../categories/category.schema.js";
import { parseId } from "../../middleware/parseId.js";
import { reRenderWithErrors } from "../../middleware/respond.js";
import { validate } from "../../middleware/validate.js";
import { config } from "../../config/index.js";

const router = Router();

/**
 * Type list with post counts.
 */
router.get("/", async (req, res) => {
	const query = validate(listTypesQuerySchema, req.query);
	const { data, meta } = await service.list(query);

	res.render("types/index", {
		title: "Types",
		activeNav: "types",
		types: data,
		meta,
		markdownTypes: config.ui.markdownTypes,
	});
});

/**
 * Empty create form.
 *
 * Declared before `/:id` so "new" is never read as an id.
 */
router.get("/new", (_req, res) => {
	res.render("types/form", {
		title: "New type",
		activeNav: "types",
		values: {},
	});
});

/**
 * Create a type, then go back to the list.
 */
const createType = async (req, res, next) => {
	try {
		const input = validate(createTypeSchema, req.body ?? {});
		const type = await service.create(input);
		req.flash("success", `Created “${type.name}”`);
		res.redirect("/v1/web/types");
	} catch (err) {
		reRenderWithErrors(err, req, res, next, {
			view: "types/form",
			title: "New type",
			activeNav: "types",
		});
	}
};

router.post("/", createType);
router.post("/new", createType);

/**
 * A type and its posts.
 */
router.get("/:id", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const type = await service.get(id);
	const query = validate(subListQuerySchema, req.query);
	const { data: posts, meta } = await service.listPosts(id, query);

	res.render("types/show", {
		title: type.name,
		activeNav: "types",
		type,
		posts,
		meta,
		markdownTypes: config.ui.markdownTypes,
	});
});

/**
 * Edit form for an existing type.
 */
router.get("/:id/edit", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const type = await service.get(id);

	res.render("types/form", {
		title: `Edit ${type.name}`,
		activeNav: "types",
		type,
		values: type,
	});
});

/**
 * Save an edited type.
 */
const updateType = async (req, res, next) => {
	const id = req.params.id;
	try {
		const input = validate(updateTypeSchema, req.body ?? {});
		const type = await service.update(id, input);
		req.flash("success", `Saved “${type.name}”`);
		res.redirect(`/v1/web/types/${type.id}`);
	} catch (err) {
		reRenderWithErrors(err, req, res, next, {
			view: "types/form",
			title: "Edit type",
			activeNav: "types",
		});
	}
};

router.post("/:id", parseId("id"), updateType);
router.put("/:id", parseId("id"), updateType);
router.post("/:id/edit", parseId("id"), updateType);

/**
 * Delete a type.
 */
const deleteType = async (req, res) => {
	const id = req.params.id;
	const type = await service.requireType(id);
	await service.remove(id);
	req.flash("success", `Deleted “${type.name}”`);
	res.redirect("/v1/web/types");
};

// Both spellings: a plain POST for no-JS forms, and DELETE for `_method=DELETE`.
router.post("/:id/delete", parseId("id"), deleteType);
router.delete("/:id", parseId("id"), deleteType);

export default router;
