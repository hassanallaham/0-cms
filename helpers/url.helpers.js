/**
 * @file URL and navigation helpers.
 * @module helpers/url
 */

import { isOptions } from "./_utils.js";

/** Mount point of the dashboard. */
const WEB_BASE = "/v1/web";

/**
 * Build a dashboard URL. Absolute paths (starting with `/`) pass through.
 *
 * @param {string} [path]
 * @returns {string}
 */
export function url(path) {
	if (!path) return WEB_BASE;
	return path.startsWith("/") ? path : `${WEB_BASE}/${path}`;
}

/**
 * Merge the current query with overrides and return a URL-encoded string.
 *
 * Handlebars appends an `options` object as the last positional argument, so the
 * `isOptions` guard stops an optional parameter from being mistaken for data.
 *
 * @param {Record<string, unknown>} current
 * @param {Record<string, unknown>} [overrides]
 * @returns {string}
 */
export function query(current, overrides) {
	const effectiveOverrides =
		isOptions(overrides) || overrides === undefined || overrides === null
			? {}
			: overrides;
	const merged = { ...(current ?? {}), ...effectiveOverrides };

	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(merged)) {
		if (value === null || value === undefined || value === "") continue;
		if (Array.isArray(value)) {
			for (const entry of value) {
				if (entry !== null && entry !== undefined && entry !== "")
					params.append(key, String(entry));
			}
		} else {
			params.append(key, String(value));
		}
	}
	return params.toString();
}

/**
 * Return `"is-active"` when the current path matches or is nested under `path`.
 *
 * Reads `@root.currentPath`, set by `middleware/dashboardContext.js`.
 *
 * @param {string} path
 * @param {Handlebars.HelperOptions} options
 * @returns {string}
 */
export function isActive(path, options) {
	const current = options?.data?.root?.currentPath ?? "";
	if (!current || !path) return "";
	return current === path || current.startsWith(`${path}/`) ? "is-active" : "";
}

/**
 * Return the exact-match class for the current path (used for a top-level item
 * that should only light up on itself).
 *
 * @param {string} path
 * @param {Handlebars.HelperOptions} options
 * @returns {string}
 */
export function isActiveExact(path, options) {
	const current = options?.data?.root?.currentPath ?? "";
	return current === path ? "is-active" : "";
}

/**
 * Build a URL for a static asset served from `public/`.
 *
 * @param {string} path - Path relative to `public/`, e.g. `stylesheets/main.css`.
 * @returns {string}
 */
export function asset(path) {
	const clean = String(path ?? "").replace(/^\/+/, "");
	return `/${clean}`;
}

/**
 * Public URL of a stored blob.
 *
 * @param {string|null|undefined} storedPath - Path as held in `files.path`.
 * @returns {string}
 */
export function blobUrl(storedPath) {
	if (!storedPath) return "";
	const clean = String(storedPath)
		.split(/[\\/]+/)
		.filter(Boolean)
		.join("/");
	return `/storage/${clean}`;
}

/**
 * Build a pagination link for the current path and query.
 *
 * @param {number} page
 * @param {Handlebars.HelperOptions} options
 * @returns {string}
 */
export function paginationUrl(page, options) {
	const root = options?.data?.root ?? {};
	const path = root.currentPath ?? "";
	const qs = query(root.query ?? {}, { page });
	return qs ? `${path}?${qs}` : path;
}

/**
 * Toggle the sort direction on `field`, preserving every other query parameter.
 *
 * Clicking the already-sorted column flips asc → desc → asc; clicking a different
 * column starts it at asc. Sorting always returns to page 1.
 *
 * @param {string} field
 * @param {Handlebars.HelperOptions} options
 * @returns {string}
 */
export function sortUrl(field, options) {
	const root = options?.data?.root ?? {};
	const path = root.currentPath ?? "";
	const currentSort = String(root.query?.sort ?? "");
	const [currentField, direction] = currentSort.startsWith("-")
		? [currentSort.slice(1), "desc"]
		: [currentSort, "asc"];

	const nextSort =
		currentField === field && direction === "asc" ? `-${field}` : field;
	const qs = query(root.query ?? {}, { sort: nextSort, page: undefined });
	return qs ? `${path}?${qs}` : path;
}

/**
 * Arrow glyph indicating the current sort state of a column.
 *
 * @param {string} field
 * @param {Handlebars.HelperOptions} options
 * @returns {string}
 */
export function sortIndicator(field, options) {
	const currentSort = String(options?.data?.root?.query?.sort ?? "");
	if (!currentSort) return "";
	const descending = currentSort.startsWith("-");
	const column = descending ? currentSort.slice(1) : currentSort;
	if (column !== field) return "";
	return descending ? "▾" : "▴";
}