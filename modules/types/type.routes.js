/**
 * @file `/v1/json/types` — read-only access to the closed type set.
 *
 * There is no `POST`, `PATCH` or `DELETE` here by design: types come from the
 * migration seed so that a post can always rely on `Article` and `Note` existing.
 * A request to write one gets the router's 405 rather than a silent no-op.
 *
 * @module modules/types/type.routes
 */

import { Router } from "express";

import * as service from "./type.service.js";
import { createTypeSchema, listTypesQuerySchema, updateTypeSchema } from "./type.schema.js";
import { subListQuerySchema } from "../categories/category.schema.js";
import { parseId } from "../../middleware/parseId.js";
import { sendNoContent, sendOk, sendPage } from "../../middleware/respond.js";
import { validate } from "../../middleware/validate.js";

const router = Router();

/**
 * List types with their post counts.
 */
router.get("/", async (req, res) => {
	const query = validate(listTypesQuerySchema, req.query);
	sendPage(res, await service.list(query));
});

/**
 * Create a type.
 */
router.post("/", async (req, res) => {
	const input = validate(createTypeSchema, req.body ?? {});
	sendOk(res, await service.create(input), { status: 201 });
});

/**
 * Read one type.
 */
router.get("/:id", parseId("id"), async (req, res) => {
	sendOk(res, await service.get(req.params.id));
});

/**
 * Update a type.
 */
router.patch("/:id", parseId("id"), async (req, res) => {
	const input = validate(updateTypeSchema, req.body ?? {});
	sendOk(res, await service.update(req.params.id, input));
});

/**
 * Delete a type. Refused while posts still use it.
 */
router.delete("/:id", parseId("id"), async (req, res) => {
	await service.remove(req.params.id);
	sendNoContent(res);
});

/**
 * Posts of this type.
 */
router.get("/:id/posts", parseId("id"), async (req, res) => {
	const id = req.params.id;
	const query = validate(subListQuerySchema, req.query);
	sendPage(res, await service.listPosts(id, query));
});

export default router;
