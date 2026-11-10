/**
 * @file Zod validation bridge for Express.
 *
 * Services take plain, already-validated objects, so the boundary between HTTP
 * and a service has to run a schema and translate failures into `AppError`s.
 * Doing that here means no route repeats the try/catch, and no service ever sees
 * an unvalidated payload.
 *
 * @module middleware/validate
 */

import { ValidationError } from "./errors.js";

/**
 * Validate `source` against `schema` and return the parsed value.
 *
 * The parsed value is returned rather than the raw input on purpose: coercion
 * (`"3"` → `3`), defaults and blank-string-to-`null` preprocessing all happen
 * once, here, so downstream code can trust its types.
 *
 * @template T
 * @param {{ safeParse: (value: unknown) => { success: true, data: T } | { success: false, error: import('zod').ZodError } }} schema
 * @param {unknown} source - `req.body`, `req.query`, `req.params`, or a plain object.
 * @returns {T}
 * @throws {ValidationError} With one error entry per issue, in `{ field, message }` form.
 */
export function validate(schema, source) {
	const result = schema.safeParse(source);
	if (result.success) return result.data;

	throw new ValidationError(
		"That submission is not valid",
		result.error.issues.map((issue) => ({
			field: issue.path.join(".") || "(root)",
			message: issue.message,
		})),
		{ cause: result.error },
	);
}

/**
 * Validate several sources at once, e.g. params and query on one route.
 *
 * @template {Record<string, unknown>} T
 * @param {Record<string, { safeParse: Function }>} schemas - Keyed by output name.
 * @param {Record<string, unknown>} sources - Keyed the same way.
 * @returns {T}
 * @throws {ValidationError}
 */
export function validateAll(schemas, sources) {
	/** @type {Record<string, unknown>} */
	const out = {};
	/** @type {Array<{ field: string, message: string }>} */
	const issues = [];

	for (const [key, schema] of Object.entries(schemas)) {
		const result = /** @type {{ safeParse: (value: unknown) => { success: boolean, data?: unknown, error?: import('zod').ZodError } }} */ (
			schema
		).safeParse(sources[key]);

		if (result.success) {
			out[key] = result.data;
		} else {
			for (const issue of result.error?.issues ?? []) {
				issues.push({
					field: `${key}.${issue.path.join(".") || "(root)"}`,
					message: issue.message,
				});
			}
		}
	}

	if (issues.length > 0) {
		throw new ValidationError("That submission is not valid", issues);
	}

	return /** @type {T} */ (out);
}
