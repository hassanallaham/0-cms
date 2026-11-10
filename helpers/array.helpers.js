/**
 * @file Array, object, and JSON helpers.
 * @module helpers/array
 */

import { safe, isOptions } from "./_utils.js";

/**
 * Length of a string or array.
 * @param {unknown} value
 * @returns {number}
 */
export function length(value) {
	if (Array.isArray(value)) return value.length;
	if (typeof value === "string") return value.length;
	if (value && typeof value === "object") return Object.keys(value).length;
	return 0;
}

/** @param {unknown[]} arr @returns {*} */
export const first = (arr) => (Array.isArray(arr) ? arr[0] : undefined);

/** @param {unknown[]} arr @returns {*} */
export const last = (arr) =>
	Array.isArray(arr) && arr.length ? arr[arr.length - 1] : undefined;

/**
 * JSON-stringify a value for safe embedding in `<script>` tags.
 * Escapes `<`, `>`, `&`, U+2028, U+2029.
 *
 * @param {*} value
 * @returns {Handlebars.SafeString}
 */
export function json(value) {
	const out = JSON.stringify(value ?? null)
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e")
		.replace(/&/g, "\\u0026")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");
	return safe(out);
}

/**
 * Extract a property from every element of an array.
 * @param {unknown[]} arr
 * @param {string} key
 * @returns {unknown[]}
 */
export function pluck(arr, key) {
	if (!Array.isArray(arr)) return [];
	return arr.map((item) =>
		item && typeof item === "object" ? item[key] : undefined,
	);
}

/**
 * Join array elements with a separator.
 * Usage: {{join list}} or {{join list ", "}}.
 * @param {unknown[]} arr
 * @param {string} [sep=', ']
 * @returns {string}
 */
export function join(arr, sep) {
	const effectiveSep = isOptions(sep) || sep === undefined || sep === null ? ", " : String(sep);
	return Array.isArray(arr)
		? arr.filter((v) => v !== null && v !== undefined).join(effectiveSep)
		: "";
}

/**
 * Build an array from its arguments, for `{{#each (array a b c)}}`.
 *
 * Handlebars has no literal list syntax, so page templates that need a small
 * fixed set (sort choices, page-head buttons) compose one inline instead of
 * having the route build it.
 *
 * Usage: `{{#each (array "a" "b")}}`
 *
 * @param {...unknown} items
 * @returns {unknown[]}
 */
export function array(...items) {
	return items.slice(0, -1).filter((item) => item !== undefined);
}

/**
 * Build an object from named arguments.
 *
 * Usage: `{{> page-head actions=(array (hash href="/x" label="X"))}}`
 *
 * Written as `name=value` in the template, so the pairs arrive on `options.hash`
 * rather than as positional arguments — Handlebars collects trailing `key=value`
 * tokens into a single object on the last argument.
 *
 * @param {...unknown} pairs - Positional arguments followed by the
 *   `Handlebars.HelperOptions` object; a plain object argument is also accepted so
 *   the helper can be called programmatically.
 * @returns {Record<string, unknown>}
 */
export function hash(...pairs) {
	const options = /** @type {Handlebars.HelperOptions} */ (pairs[pairs.length - 1]);
	const fromOptions = options && typeof options === "object" && options.hash ? options.hash : null;
	if (fromOptions) return { ...fromOptions };

	// Fallback: alternating key/value arguments, for direct calls.
	const args = pairs.slice(0, -1);
	/** @type {Record<string, unknown>} */
	const out = {};
	for (let index = 0; index + 1 < args.length; index += 2) {
		out[String(args[index])] = args[index + 1];
	}
	return out;
}
