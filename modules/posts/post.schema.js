/**
 * @file Validation schemas for post input.
 *
 * The `relations` field is the one genuinely post-specific idea in the data
 * model: a post may link to other posts and to files, in both directions, and
 * both ends go through this single field so the editor can render one widget.
 *
 * @module modules/posts/post.schema
 */

import { z } from "zod";

import { config } from "../../config/index.js";
import { photoRef, ref } from "../../utils/relation.schema.js";
import {
	lenientQuery,
	pagingSchema,
} from "../categories/category.schema.js";

/** Workflow states a post may be in. Mirrors `posts_status_valid` in the migration. */
export const POST_STATUSES = ["draft", "needs_work", "published"];

/** Relation kinds a post may declare. Keys match the join table suffixes. */
export const POST_RELATION_KINDS = ["posts", "files"];

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
 * A single relation link: which kind of thing, and which one.
 *
 * Ids and names are both accepted so the editor can run without JavaScript.
 */
const relationEntry = z.object({
	type: z.enum(POST_RELATION_KINDS),
	id: z.union([z.coerce.number().int().positive(), z.string().trim().min(1)]).optional(),
	name: z.string().trim().min(1).optional(),
});

/**
 * Normalise the many shapes a relation payload can arrive in.
 *
 * Accepts `{ posts: [1, 2], files: ["img.png"] }` from a form, or
 * `[{ type, id }, …]` from JSON, and always yields the latter. Blanks and
 * duplicates are dropped so a re-rendered form never duplicates a join row.
 *
 * @param {unknown} value
 * @returns {Array<{ type: string, id?: number, name?: string }>}
 */
function normaliseRelations(value) {
	if (value === undefined || value === null) return [];

	const collected = [];

	if (Array.isArray(value)) {
		collected.push(...value);
	} else if (typeof value === "object") {
		for (const [type, items] of Object.entries(value)) {
			if (!POST_RELATION_KINDS.includes(type)) continue;
			const list = Array.isArray(items) ? items : [items];
			for (const item of list) {
				if (item === null || item === undefined || item === "") continue;
				collected.push(
					typeof item === "object"
						? { type, ...item }
						: { type, id: item },
				);
			}
		}
	}

	const seen = new Set();
	/** @type {Array<{ type: string, id?: number, name?: string }>} */
	const unique = [];
	for (const entry of collected) {
		const parsed = relationEntry.safeParse(entry);
		if (!parsed.success) continue;
		const key = `${parsed.data.type}:${parsed.data.id ?? parsed.data.name}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(parsed.data);
	}

	return unique;
}

/**
 * Normalise a tag list into plain names.
 *
 * A form posts `tags` as a string or a repeated field; JSON posts an array of
 * ids or names. Both collapse to a de-duplicated list of non-empty names, which
 * `resolveRefs` then turns into ids.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
function normaliseTags(value) {
	if (value === undefined || value === null) return [];

	const items = Array.isArray(value)
		? value.flatMap((entry) => (typeof entry === "string" ? entry.split(",") : [entry]))
		: typeof value === "string"
			? value.split(",")
			: [value];

	/** @type {string[]} */
	const names = [];
	for (const item of items) {
		if (item === null || item === undefined) continue;
		const text = String(item).trim();
		if (text === "") continue;
		if (!names.includes(text)) names.push(text);
	}
	return names;
}

/**
 * Body/params for creating a post.
 */
export const createPostSchema = z.object({
	title: z.preprocess(
		optionalText,
		z.string().min(1, "A title is required").max(300),
	),
	content: z.preprocess(optionalText, z.string().max(2_000_000).nullable().optional()),
	notes: z.preprocess(optionalText, z.string().max(20_000).nullable().optional()),
	status: z.preprocess(optionalText, z.enum(POST_STATUSES).default("draft")),
	type: z
		.union([z.coerce.number().int().positive(), z.string().trim().min(1)])
		.nullable()
		.optional(),
	category: z
		.union([z.coerce.number().int().positive(), z.string().trim().min(1)])
		.nullable()
		.optional(),
	photo: photoRef().nullable().optional(),
	relations: z.preprocess(normaliseRelations, z.array(relationEntry)),
	attachments: z.preprocess(normaliseTags, z.array(z.string().trim().min(1))),
});

/**
 * Body/params for updating a post.
 *
 * `relations` and `attachments` are all-or-nothing: when either key appears, the
 * submitted set replaces the stored set. That keeps a partial update from
 * silently discarding links the form did not know about.
 */
export const updatePostSchema = z
	.object({
		title: z.preprocess(optionalText, z.string().min(1).max(300).optional()),
		content: z.preprocess(optionalText, z.string().max(2_000_000).nullable().optional()),
		notes: z.preprocess(optionalText, z.string().max(20_000).nullable().optional()),
		status: z.preprocess(optionalText, z.enum(POST_STATUSES).optional()),
		type: z
			.union([z.coerce.number().int().positive(), z.string().trim().min(1)])
			.nullable()
			.optional(),
		category: z
			.union([z.coerce.number().int().positive(), z.string().trim().min(1)])
			.nullable()
			.optional(),
		photo: photoRef().nullable().optional(),
		relations: z.preprocess(normaliseRelations, z.array(relationEntry)),
		attachments: z.preprocess(normaliseTags, z.array(z.string().trim().min(1))),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "Nothing to update",
	});

/**
 * Query string for the post list.
 */
export const listPostsQuerySchema = lenientQuery(
	pagingSchema.extend({
		sort: z.string().optional(),
		q: z.string().trim().optional(),
		status: z.enum(POST_STATUSES).optional(),
		type: z.union([z.coerce.number().int().positive(), z.string().trim()]).optional(),
		category: z.union([z.coerce.number().int().positive(), z.string().trim()]).optional(),
		"filter[title]": z.string().trim().optional(),
		"filter[status]": z.string().trim().optional(),
	}),
);

/**
 * Query string for autocomplete suggestions.
 */
export const lookupQuerySchema = pagingSchema
	.extend({
		q: z.string().trim().default(""),
		exclude: z.coerce.number().int().positive().optional(),
		limit: z.coerce.number().int().positive().max(25).default(10),
	})
	.omit({ page: true })
	.transform((data) => ({ ...data, limit: data.limit ?? config.ui.pageSize }));
