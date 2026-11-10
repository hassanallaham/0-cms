/**
 * @file Zod schemas for category input.
 *
 * Two conventions apply throughout the app:
 *
 *  - **Coerce, then validate.** Query strings and HTML forms deliver everything
 *    as text, so numbers are coerced and empty strings become `null` before the
 *    range checks run.
 *  - **Relation fields accept a reference, not an id.** A picker sends `{ id }`
 *    when JavaScript is available and a bare name when it is not; `utils/refs.js`
 *    turns either into a validated id later. See SRS.md §8.5.
 *
 * @module modules/categories/category.schema
 */

import { z } from "zod";

import { config } from "../../config/index.js";
import { photoRef, ref } from "../../utils/relation.schema.js";

/**
 * Coerce an HTML-form value to `null` when the user cleared the field.
 *
 * An empty string is what `<select>` and a cleared text input both submit, and it
 * always means "no relation" — never "the empty id".
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
 * A relation supplied as an id, a name, or a `{ id | name }` object.
 *
 * @returns {import('zod').ZodType}
 */
const relation = () => z.union([z.string(), z.number(), z.null()]);

/**
 * Drop query parameters whose value is a blank string.
 *
 * Every list screen renders `<option value="">` for "no filter" and "default
 * order", so submitting a filter form without choosing anything sends
 * `filter[root]=` and `sort=`. A cleared control means "not supplied", and an
 * empty string is not a valid id, enum member or sort column — letting it reach
 * those schemas turns an ordinary search into a 422.
 *
 * Only whole blank values are removed. A parameter that is absent, an array, or
 * a non-string value is passed through untouched.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
const dropBlankValues = (value) => {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;

	/** @type {Record<string, unknown>} */
	const cleaned = {};
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry === "string" && entry.trim() === "") continue;
		cleaned[key] = entry;
	}
	return cleaned;
};

/**
 * Wrap a query-string object schema so cleared controls are treated as absent.
 *
 * @param {{ safeParse: (value: unknown) => unknown }} schema
 * @returns {{ safeParse: (value: unknown) => { success: true, data: any } | { success: false, error: import('zod').ZodError } }}
 */
export const lenientQuery = (schema) => z.preprocess(dropBlankValues, schema);

/**
 * Shared pagination parameters.
 */
export const pagingSchema = z.object({
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(config.ui.pageSize),
});

/**
 * Body/params for creating a category.
 */
export const createCategorySchema = z.object({
	name: z.preprocess(
		optionalText,
		z.string().min(1, "A name is required").max(160),
	),
	description: z.preprocess(
		optionalText,
		z.string().max(2000).nullable().optional(),
	),
	// Free-text parent picker: a name when typed, an id when selected.
	mother_category: relation().nullable().optional(),
	photo: photoRef().nullable().optional(),
});

/**
 * Body/params for updating a category. Every field is optional, but at least one
 * must be present so a stray empty submit is reported rather than silently
 * treated as a successful no-op.
 */
export const updateCategorySchema = z
	.object({
		name: z.preprocess(
			optionalText,
			z.string().min(1).max(160).optional(),
		),
		description: z.preprocess(
			optionalText,
			z.string().max(2000).nullable().optional(),
		),
		mother_category: relation().nullable().optional(),
		photo: photoRef().nullable().optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "Nothing to update",
	});

/**
 * Query string for listing categories.
 */
export const listCategoriesQuerySchema = lenientQuery(
	pagingSchema.extend({
		sort: z.string().optional(),
		q: z.string().trim().optional(),
		"filter[name]": z.string().trim().optional(),
		"filter[root]": z.enum(["true", "false"]).optional(),
		"filter[mother_category]": z.coerce.number().int().positive().optional(),
	}),
);

/**
 * Query string for the autocomplete endpoint.
 */
export const lookupQuerySchema = z.object({
	q: z.string().trim().default(""),
	exclude: z.coerce.number().int().positive().optional(),
	limit: z.coerce.number().int().positive().max(25).default(10),
});
/**
 * Query string for a sub-collection list (`/categories/:id/posts`,
 * `/tags/:id/files`, …).
 *
 * Only paging and a sort hint: filtering happens on the collection endpoints,
 * where the filters belong to that entity rather than to the relation.
 */
export const subListQuerySchema = lenientQuery(
	pagingSchema.extend({
		sort: z.string().optional(),
	}),
);
