/**
 * @file Comparison and logical helpers.
 * @module helpers/logic
 */

/** @param {*} a @param {*} b @returns {boolean} */
export const eq = (a, b) => a === b;

/** @param {*} a @param {*} b @returns {boolean} */
export const ne = (a, b) => a !== b;

/** @param {*} a @param {*} b @returns {boolean} */
export const gt = (a, b) => a > b;

/** @param {*} a @param {*} b @returns {boolean} */
export const gte = (a, b) => a >= b;

/** @param {*} a @param {*} b @returns {boolean} */
export const lt = (a, b) => a < b;

/** @param {*} a @param {*} b @returns {boolean} */
export const lte = (a, b) => a <= b;

/**
 * Logical AND across all arguments (Handlebars options are ignored).
 * @param {...*} args
 * @returns {boolean}
 */
export function and(...args) {
	args.pop(); // trailing options
	return args.every(Boolean);
}

/**
 * Logical OR across all arguments (Handlebars options are ignored).
 * @param {...*} args
 * @returns {boolean}
 */
export function or(...args) {
	args.pop();
	return args.some(Boolean);
}

/**
 * @param {*} value
 * @returns {boolean}
 */
export const not = (value) => !value;

/**
 * True when `haystack` (array or string) contains `needle`.
 * @param {Array|string|null|undefined} haystack
 * @param {*} needle
 * @returns {boolean}
 */
export function includes(haystack, needle) {
	if (Array.isArray(haystack)) return haystack.includes(needle);
	if (typeof haystack === "string") return haystack.includes(needle);
	return false;
}

/**
 * Return `value` when it is not null/undefined, else `fallback`.
 * Registered as `default` (a reserved word in JS).
 *
 * @param {*} value
 * @param {*} fallback
 * @returns {*}
 */
export function defaultValue(value, fallback) {
	return value ?? fallback;
}
