/**
 * @file Validation schemas for the lookup endpoint.
 * @module modules/lookup/lookup.schema
 */

import { z } from "zod";

import { LOOKUP_ENTITIES } from "./lookup.service.js";

/**
 * `GET /v1/json/lookup/:entity`
 *
 * `exclude` keeps an entity out of its own suggestions, so a category cannot be
 * offered as its own parent and a post cannot be offered as a link target.
 */
export const lookupQuerySchema = z.object({
	q: z.string().trim().max(160).default(""),
	limit: z.coerce.number().int().positive().max(25).default(10),
	exclude: z.coerce.number().int().positive().optional(),
});

/**
 * Path parameter: which entity to autocomplete.
 */
export const lookupParamsSchema = z.object({
	entity: z.enum(/** @type {readonly [string, ...string[]]} */ (LOOKUP_ENTITIES)),
});
