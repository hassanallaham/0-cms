/**
 * @file Small pure helpers shared across the app.
 * @module utils/helpers
 */

/**
 * Interpret an environment string as a boolean.
 *
 * Accepts `true`/`false` (any case) and `1`/`0`. An absent or empty value
 * yields `fallback` so an unset variable never crashes the boot.
 *
 * @param {unknown} input - Raw value, typically from `process.env`.
 * @param {boolean} [fallback=false] - Value used when `input` is absent or blank.
 * @returns {boolean}
 */
export function booleanFromString(input, fallback = false) {
	if (input === undefined || input === null || input === "") return fallback;
	const normalized = String(input).trim().toLowerCase();
	if (normalized === "true" || normalized === "1" || normalized === "yes")
		return true;
	if (normalized === "false" || normalized === "0" || normalized === "no")
		return false;
	throw new Error(`Expected a boolean but received "${input}"`);
}

/**
 * Split a comma-separated environment variable into a trimmed, non-empty list.
 *
 * @param {unknown} input
 * @returns {string[]}
 */
export function csvToArray(input) {
	if (!input) return [];
	return String(input)
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

/**
 * Return `value` when it is neither `null` nor `undefined`, otherwise `fallback`.
 *
 * @template T
 * @param {T|null|undefined} value
 * @param {T} fallback
 * @returns {T}
 */
export function orDefault(value, fallback) {
	return value === null || value === undefined ? fallback : value;
}

/**
 * Remove `undefined` entries from an object so a patch only carries real changes.
 *
 * @template {Record<string, unknown>} T
 * @param {T} object
 * @returns {Partial<T>}
 */
export function definedOnly(object) {
	/** @type {Record<string, unknown>} */
	const out = {};
	for (const [key, value] of Object.entries(object ?? {})) {
		if (value !== undefined) out[key] = value;
	}
	return /** @type {Partial<T>} */ (out);
}

/**
 * Normalise a free-text search term for `LIKE` comparison.
 *
 * Escapes the SQL `LIKE` wildcards so a user searching for `100%` does not get
 * an accidental prefix match on every row.
 *
 * @param {string} term
 * @returns {string}
 */
export function escapeLike(term) {
	return String(term ?? "")
		.replace(/[\\%_]/g, (match) => `\\${match}`)
		.trim();
}

/**
 * De-duplicate a list, preserving first-seen order.
 *
 * @template T
 * @param {T[]} values
 * @returns {T[]}
 */
export function unique(values) {
	return [...new Set(values ?? [])];
}