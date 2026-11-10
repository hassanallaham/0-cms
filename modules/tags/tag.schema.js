/**
 * @file Validation schemas for tag input.
 * @module modules/tags/tag.schema
 */

import { z } from "zod";

import { photoRef, ref } from "../../utils/relation.schema.js";
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
 * Body/params for creating a tag.
 */
export const createTagSchema = z.object({
	name: z.preprocess(
		optionalText,
		z.string().min(1, "A name is required").max(160),
	),
	photo: photoRef().nullable().optional(),
});

/**
 * Body/params for updating a tag.
 */
export const updateTagSchema = z
	.object({
		name: z.preprocess(optionalText, z.string().min(1).max(160).optional()),
		photo: photoRef().nullable().optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "Nothing to update",
	});

/**
 * Query string for the tag list.
 */
export const listTagsQuerySchema = lenientQuery(
	pagingSchema.extend({
		sort: z.string().optional(),
		q: z.string().trim().optional(),
		"filter[name]": z.string().trim().optional(),
	}),
);

/**
 * Body/params for replacing a set of tag references on a post or file.
 *
 * Accepts a single value, a repeated key, or a bracket list — see
 * `utils/refs.js#toRawList`.
 */
export const assignTagsSchema = z.object({
	tags: z.union([z.string(), z.array(z.string())]).optional(),
});
