/**
 * @file Validation schemas for type input.
 * @module modules/types/type.schema
 */

import { z } from "zod";

import {
	lenientQuery,
	pagingSchema,
} from "../categories/category.schema.js";

/**
 * Turn a blank form field into `null` instead of failing a `.min()`.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
const optionalText = (value) => {
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
};

/**
 * Body for creating a type.
 *
 * The slug is optional: it is derived from the name when omitted, which is what
 * the dashboard form does.
 */
export const createTypeSchema = z.object({
	name: z.preprocess(optionalText, z.string().min(1, "A name is required").max(80)),
	slug: z.preprocess(optionalText, z.string().min(1).max(80).nullable().optional()),
});

/**
 * Body for updating a type.
 */
export const updateTypeSchema = z
	.object({
		name: z.preprocess(optionalText, z.string().min(1).max(80).optional()),
		slug: z.preprocess(optionalText, z.string().min(1).max(80).nullable().optional()),
	})
	.refine((data) => Object.keys(data).length > 0, { message: "Nothing to update" });

/**
 * Query string for the type list.
 */
export const listTypesQuerySchema = lenientQuery(
	pagingSchema.extend({
		sort: z.string().optional(),
		q: z.string().trim().optional(),
	}),
);
