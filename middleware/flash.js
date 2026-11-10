/**
 * @file Cookie-backed flash messages for redirect-based flows.
 *
 * Messages are written to a short-lived cookie so they survive exactly one
 * redirect without any server-side session store.
 *
 * @module middleware/flash
 */

import { config } from "../config/index.js";

/** Cookie name. Distinct from the theme cookie so the two never collide. */
const FLASH_COOKIE = "flash";

/** Long enough to survive a redirect, short enough that a stale message is not
 *  waiting for the user tomorrow. */
const MAX_AGE_MS = 15_000;

/** Never render more than this many toasts at once. */
const MAX_MESSAGES = 5;

/**
 * @typedef {object} FlashMessage
 * @property {'success'|'error'|'info'|'warning'} type
 * @property {string} message
 */

/**
 * Valid flash types.
 * @type {readonly string[]}
 */
const FLASH_TYPES = ["success", "error", "info", "warning"];

/**
 * Attach `req.flash(type, message)` and expose the current queue as
 * `res.locals.flash`.
 *
 * @returns {import('express').RequestHandler}
 */
export function flashMiddleware() {
	return (req, res, next) => {
		/** @type {FlashMessage[]} */
		let incoming = [];
		const raw = req.cookies?.[FLASH_COOKIE];

		if (raw) {
			res.clearCookie(FLASH_COOKIE, { path: "/" });
			try {
				const parsed = JSON.parse(decodeURIComponent(raw));
				if (Array.isArray(parsed)) {
					incoming = parsed.filter(
						(entry) =>
							entry &&
							typeof entry.message === "string" &&
							typeof entry.type === "string",
					);
				}
			} catch {
				// A malformed cookie is not worth failing a page render over.
			}
		}

		res.locals.flash = incoming;

		/**
		 * Queue a flash message for the next rendered page.
		 *
		 * @param {'success'|'error'|'info'|'warning'} type
		 * @param {string} message
		 */
		req.flash = (type, message) => {
			const safeType = FLASH_TYPES.includes(type) ? type : "info";
			const queued = [...(res.locals.flash ?? []), { type: safeType, message }];
			const trimmed = queued.slice(-MAX_MESSAGES);
			res.locals.flash = trimmed;
			res.cookie(FLASH_COOKIE, encodeURIComponent(JSON.stringify(trimmed)), {
				path: "/",
				httpOnly: false,
				sameSite: "strict",
				maxAge: MAX_AGE_MS,
			});
		};

		next();
	};
}