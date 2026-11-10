/**
 * @file String and text helpers.
 * @module helpers/string
 */

import { isOptions } from "./_utils.js";
import { slugify as buildSlug } from "../utils/slug.js";

/**
 * Uppercase the first character.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function capitalize(value) {
	const text = String(value ?? "");
	return text ? text[0].toUpperCase() + text.slice(1) : "";
}

/**
 * Lowercase a value.
 *
 * @param {unknown} value
 * @returns {string}
 */
export const lowercase = (value) => String(value ?? "").toLowerCase();

/**
 * Uppercase a value.
 *
 * @param {unknown} value
 * @returns {string}
 */
export const uppercase = (value) => String(value ?? "").toUpperCase();

/**
 * URL-safe slug of a value. Shares its implementation with the service layer so
 * a displayed slug is always the one that would actually be stored.
 *
 * @param {unknown} value
 * @returns {string}
 */
export const slugify = (value) => buildSlug(value);

/**
 * Concatenate all non-options arguments. Handlebars options are ignored.
 *
 * @param {...*} args
 * @returns {string}
 */
export function concat(...args) {
	args.pop();
	return args.map((entry) => (entry === null || entry === undefined ? "" : String(entry))).join("");
}

/**
 * Truncate a string to `max` characters.
 *
 * Usage:
 *   {{truncate title 80}}          → suffix defaults to "…"
 *   {{truncate title 80 "..."}}    → custom suffix
 *
 * @param {unknown} value
 * @param {number} max
 * @param {string} [suffix='…']
 * @returns {string}
 */
export function truncate(value, max, suffix) {
	const effectiveSuffix = isOptions(suffix) || suffix === undefined || suffix === null ? "…" : String(suffix);
	const text = String(value ?? "");
	const limit = Number(max) || 0;
	if (limit <= 0 || text.length <= limit) return text;
	return `${text.slice(0, limit).trimEnd()}${effectiveSuffix}`;
}

/**
 * Up to two initials for a name, used as an avatar fallback.
 *
 * `"Ada Lovelace"` → `AL`, `"Cher"` → `C`, `""` → `?`.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function initials(value) {
	const words = String(value ?? "")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (words.length === 0) return "?";
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Percent-encoded form of a value for use inside a query string.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function urlEncode(value) {
	return encodeURIComponent(String(value ?? ""));
}