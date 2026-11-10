/**
 * @file Shared utilities for Handlebars helpers.
 * @module helpers/_util
 */

import Handlebars from "handlebars";

/**
 * Wrap a pre-built HTML string so Handlebars does not escape it.
 *
 * Use this ONLY when the string is fully constructed by trusted code
 * (icons, badges, CSRF fields). Never wrap user-provided content.
 *
 * @param {string} html
 * @returns {Handlebars.SafeString}
 */
export function safe(html) {
	return new Handlebars.SafeString(html);
}

/**
 * Escape a value for safe interpolation into HTML text or attributes.
 * Delegates to Handlebars' built-in escaper.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function esc(value) {
	return Handlebars.escapeExpression(value == null ? "" : String(value));
}

/**
 * Coerce a value into a valid Date, or return null when invalid.
 *
 * SQLite's legacy `CURRENT_TIMESTAMP` format — `YYYY-MM-DD HH:MM:SS` — is UTC but
 * carries no marker, and `new Date()` would read it as local time, shifting every
 * timestamp by the machine's offset. Timestamps are now stored as ISO-8601 with a
 * `Z` (see `db/knex.js#utcNow`), but rows written before that still carry the old
 * shape, so it is normalised here rather than rendering a wrong time.
 *
 * @param {Date|string|number|null|undefined} value
 * @returns {Date|null}
 */
export function toDate(value) {
	if (value == null) return null;
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}

	if (typeof value === "string") {
		const legacy = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/.exec(value.trim());
		const d = new Date(legacy ? `${legacy[1]}T${legacy[2]}Z` : value);
		return Number.isNaN(d.getTime()) ? null : d;
	}

	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * True when the value is a Handlebars helper-options object.
 *
 * Handlebars always appends an options object as the last argument to every
 * helper invocation. When a helper has optional positional parameters we must
 * detect this to avoid treating `options` as a real argument.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isOptions(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		"hash" in value &&
		"data" in value &&
		typeof value.lookupProperty === "function"
	);
}
