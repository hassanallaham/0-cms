/**
 * @file Form helpers.
 * @module helpers/form
 *
 * Convention: after a failed POST, the controller re-renders the form with
 * `res.locals.form = { values: {...}, errors: { field: 'message' | [messages] } }`.
 */

import { isOptions } from "./_utils.js";

/**
 * @file Form helpers.
 * @module helpers/form
 *
 * Convention: after a failed POST, the controller re-renders the form with
 * `res.locals.form = { values: {...}, errors: { field: 'message' | [messages] } }`.
 */

/**
 * Output the string `selected` if `a` equals `b`.
 * @param {*} a
 * @param {*} b
 * @returns {string}
 */
export function selected(a, b) {
	return String(a ?? "") === String(b ?? "") ? "selected" : "";
}

/**
 * Output `checked` if the value is truthy.
 * @param {*} value
 * @returns {string}
 */
export function checked(value) {
	return value ? "checked" : "";
}

/**
 * Return a previously submitted value for `field`, or `fallback`.
 * @param {object} form
 * @param {string} field
 * @param {*} [fallback='']
 * @returns {*}
 */
export function old(form, field, fallback) {
	const effectiveFallback =
		isOptions(fallback) || fallback === undefined ? "" : fallback;
	if (!form || typeof form !== "object" || !form.values)
		return effectiveFallback;
	const v = form.values[field];
	return v == null ? effectiveFallback : v;
}

/**
 * Return the first error message for a field, or empty string.
 * @param {object} errors
 * @param {string} field
 * @returns {string}
 */
export function fieldError(errors, field) {
	if (!errors || typeof errors !== "object") return "";
	const e = errors[field];
	if (e == null) return "";
	return Array.isArray(e) ? String(e[0] ?? "") : String(e);
}

/**
 * True when a field has at least one error.
 * @param {object} errors
 * @param {string} field
 * @returns {boolean}
 */
export function hasError(errors, field) {
	if (!errors || typeof errors !== "object") return false;
	const e = errors[field];
	if (e == null) return false;
	return Array.isArray(e) ? e.length > 0 : true;
}
