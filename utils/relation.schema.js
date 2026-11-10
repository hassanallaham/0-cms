import { z } from "zod";

/**
 * A relation target: either an existing id, or a name/title to resolve.
 *
 * Every relation body in the SRS has this shape, so the JSON routes and the
 * dashboard pickers share one definition. Resolution happens in `utils/refs.js`.
 *
 * @returns {import("zod").ZodUnion<[import("zod").ZodNumber, import("zod").ZodString]>}
 */
export const ref = () => z.union([z.coerce.number().int().positive(), z.string().trim().min(1)]);

/**
 * A photo reference: like {@link ref}, but blank is also accepted.
 *
 * An absent relation is expressed by omitting the field, whereas a photo is
 * cleared by submitting an empty value — that is what a browser sends for an
 * untouched input, and what `resolvePhotoPath` documents ("blank resolves to
 * null"). Without the empty-string member here the union rejected `""` at the
 * schema layer, before the resolver could apply its own rule.
 *
 * @returns {import("zod").ZodUnion<[import("zod").ZodNumber, import("zod").ZodString, import("zod").ZodLiteral>]>}
 */
export const photoRef = () =>
	z.union([z.coerce.number().int().positive(), z.string().trim().min(1), z.literal("")]);

/**
 * Body for `POST /:id/tags` — attaches one tag, given as an id or a name.
 */
export const linkTagSchema = z.object({ tag: ref() });

/**
 * Body for `POST /:id/files` — links one existing file row.
 */
export const linkFileSchema = z.object({ file: ref() });

/**
 * Body for `POST /:id/related` — creates the outbound edge `:id → to_post`.
 */
export const linkPostSchema = z.object({ to_post: ref() });

/**
 * Body for `POST /files/:id/related` — creates the outbound edge `:id → to_file`.
 */
export const linkFileRelationSchema = z.object({ to_file: ref() });

/**
 * Body for `POST /files/:id/posts` — attaches a post to a file.
 */
export const linkPostToFileSchema = z.object({ post: ref() });
