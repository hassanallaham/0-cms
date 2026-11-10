/**
 * @file `/v1/json/categories` — category CRUD and its sub-collections.
 * @module modules/categories/category.routes
 */

import { Router } from "express";

import * as service from "./category.service.js";
import {
	createCategorySchema,
	listCategoriesQuerySchema,
	subListQuerySchema,
	updateCategorySchema,
} from "./category.schema.js";
import { parseId } from "../../middleware/parseId.js";
import { sendNoContent, sendOk, sendPage } from "../../middleware/respond.js";
import { validate } from "../../middleware/validate.js";

const router = Router();

// ── Collection ───────────────────────────────────────────────────────────────

/**
 * List categories.
 */
router.get("/", async (req, res) => {
	const query = validate(listCategoriesQuerySchema, req.query);
	sendPage(res, await service.list(query));
});

/**
 * Create a category.
 */
router.post("/", async (req, res) => {
	const input = validate(createCategorySchema, req.body);
	sendOk(res, await service.create(input), { status: 201 });
});

// ── Single entity ────────────────────────────────────────────────────────────

/**
 * Read a category with its counts, parent and ancestors.
 */
router.get("/:id", parseId("id"), async (req, res) => {
	const id = req.params.id;
	sendOk(res, await service.get(id));
});

/**
 * Partially update a category.
 */
router.patch("/:id", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const input = validate(updateCategorySchema, req.body);
	sendOk(res, await service.update(id, input));
});

/**
 * Replace a category wholesale.
 *
 * `PUT` is accepted as an alias of `PATCH` because it is the verb HTML forms and
 * generic API clients reach for; this app has no partial-update semantics that a
 * full replace would express better.
 */
router.put("/:id", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const input = validate(updateCategorySchema, req.body);
	sendOk(res, await service.update(id, input));
});

/**
 * Delete a category.
 */
router.delete("/:id", parseId("id"), async (req, res) => {
	const id = req.params.id;
	await service.remove(id);
	sendNoContent(res);
});

// ── Sub-collections ──────────────────────────────────────────────────────────

/**
 * Direct sub-categories.
 */
router.get("/:id/children", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const query = validate(subListQuerySchema, req.query);
	sendPage(res, await service.listChildren(id, query));
});

/**
 * Posts in this category.
 */
router.get("/:id/posts", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const query = validate(subListQuerySchema, req.query);
	sendPage(res, await service.listPosts(id, query));
});

/**
 * Files in this category.
 */
router.get("/:id/files", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const query = validate(subListQuerySchema, req.query);
	sendPage(res, await service.listFiles(id, query));
});

export default router;
