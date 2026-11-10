/**
 * @file JSON response envelope helpers.
 *
 * Every `/v1/json` response has the same shape, so that shape is written once
 * here rather than in forty handlers:
 *
 * ```json
 * { "success": true, "data": …, "meta": … }
 * ```
 *
 * @module middleware/respond
 */

import { ValidationError } from "./errors.js";

/**
 * Send a successful JSON response.
 *
 * `meta` is only attached when present, which keeps single-record responses free
 * of a misleading `"meta": undefined`. `extra` merges sibling keys into the
 * envelope — the upload response reports `deduplicated` next to `data` (§7.1)
 * rather than wrapping the row, so a client can branch without unwrapping.
 *
 * @param {import('express').Response} res
 * @param {unknown} data
 * @param {{ status?: number, meta?: import('../utils/query.js').PageMeta, extra?: Record<string, unknown> }} [options]
 * @returns {import('express').Response}
 */
export function sendOk(res, data, { status = 200, meta, extra } = {}) {
	/** @type {Record<string, unknown>} */
	const body = { success: true, data };
	if (meta) body.meta = meta;
	if (extra) Object.assign(body, extra);
	return res.status(status).json(body);
}

/**
 * Send a paginated collection response.
 *
 * @param {import('express').Response} res
 * @param {{ data: unknown[], meta: import('../utils/query.js').PageMeta }} result
 * @returns {import('express').Response}
 */
export function sendPage(res, { data, meta }) {
	return sendOk(res, data, { meta });
}

/**
 * Send a 204 for a successful delete that has no representation to return.
 *
 * @param {import('express').Response} res
 * @returns {import('express').Response}
 */
export function sendNoContent(res) {
	return res.status(204).end();
}

/**
 * Turn a `ValidationError` into a re-rendered form instead of an error page.
 *
 * HTML forms have no way to show field-level errors after a redirect, so the
 * submit is re-rendered with the submitted values intact and the messages attached
 * to their fields. Anything that is not a validation failure falls through to the
 * central error handler.
 *
 * @param {unknown} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {() => void} next - Passed to the central error handler on non-validation errors.
 * @param {{ view: string, title: string, values?: Record<string, unknown>, status?: number, activeNav?: string, locals?: Record<string, unknown> }} options
 */
export function reRenderWithErrors(err, req, res, next, options) {
	if (!(err instanceof ValidationError)) {
		next(err);
		return;
	}

	const errors = /** @type {Array<{ field: string, message: string }>} */ (err.errors ?? []);

	res.status(options.status ?? 422).render(options.view, {
		// `locals` carries whatever the healthy render passed — picker options, the
		// status list — so a rejected submit shows the same form, not a hollow one.
		...(options.locals ?? {}),
		title: options.title,
		activeNav: options.activeNav,
		errors,
		// Repopulate the form from what was submitted, not from the database, so a
		// typo in one field does not discard the rest of the edit.
		values: options.values ?? req.body ?? {},
		mother: options.mother ?? null,
		formError: err.message,
	});
}
