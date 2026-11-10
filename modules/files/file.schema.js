/**
 * @file Validation schemas for file input.
 *
 * @module modules/files/file.schema
 */

import { z } from "zod";

import {
	lenientQuery,
	pagingSchema,
} from "../categories/category.schema.js";

/**
 * Body for updating a file's metadata.
 *
 * Only `category` is mutable. The blob itself is immutable by design: replacing
 * bytes under an existing id would invalidate every post that points at it.
 */
export const updateFileSchema = z
	.object({
		category: z
			.union([z.coerce.number().int().positive(), z.string().trim().min(1)])
			.nullable()
			.optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "Nothing to update",
	});

/**
 * Query string for the file list.
 */
export const listFilesQuerySchema = lenientQuery(
	pagingSchema.extend({
		sort: z.string().optional(),
		q: z.string().trim().optional(),
		mimetype: z.string().trim().optional(),
		category: z.union([z.coerce.number().int().positive(), z.string().trim()]).optional(),
		"filter[mimetype]": z.string().trim().optional(),
		"filter[extension]": z.string().trim().optional(),
	}),
);

/**
 * Multipart field names accepted by the upload endpoints.
 *
 * A form posts one blob as `file`; the JSON API may post several as `files[]`.
 * Both are read into the same normalised list by `normaliseUploads`.
 */
export const UPLOAD_FIELD = "file";
