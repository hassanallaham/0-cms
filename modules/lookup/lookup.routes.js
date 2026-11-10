/**
 * @file `GET /v1/json/lookup/:entity` — autocomplete for every picker.
 * @module modules/lookup/lookup.routes
 */

import { Router } from "express";

import * as service from "./lookup.service.js";
import { lookupParamsSchema, lookupQuerySchema } from "./lookup.schema.js";
import { sendOk } from "../../middleware/respond.js";
import { validate } from "../../middleware/validate.js";

const router = Router();

/**
 * Suggest categories, tags, types, posts or files.
 */
router.get("/:entity", async (req, res) => {
	const { entity } = validate(lookupParamsSchema, req.params);
	const query = validate(lookupQuerySchema, req.query);

	sendOk(res, await service.suggest(entity, query));
});

export default router;