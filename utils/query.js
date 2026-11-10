/**
 * @file Query parsing helpers shared by every list endpoint.
 * @module utils/query
 */

import { config } from "../config/index.js";
import { escapeLike } from "./helpers.js";

/** Hard ceiling on page size, regardless of what `config.ui.pageSize` says. */
const MAX_LIMIT = 100;

/**
 * A resolved sort instruction.
 *
 * @typedef {{ column: string, direction: 'asc' | 'desc' }} SortSpec
 */

/**
 * Parse a `sort` query parameter into a column and direction.
 *
 * Accepted forms: `field` (ascending) and `-field` (descending). Only the
 * first comma-separated token is honoured. Unknown columns fall back silently —
 * a list view should render even when someone hand-edits the URL.
 *
 * @param {string|undefined|string[]} sort - Raw `sort` parameter.
 * @param {readonly string[]} allowed - Whitelist of sortable columns.
 * @param {string} fallbackColumn
 * @param {'asc'|'desc'} [fallbackDirection='desc']
 * @returns {SortSpec}
 */
export function parseSort(sort, allowed, fallbackColumn, fallbackDirection = "desc") {
	const fallback = { column: fallbackColumn, direction: fallbackDirection };
	if (sort === undefined || sort === null || sort === "") return fallback;

	const raw = Array.isArray(sort) ? sort[0] : String(sort);
	const token = raw.split(",")[0].trim();
	const direction = token.startsWith("-") ? "desc" : "asc";
	const column = token.replace(/^[-+]/, "");

	return allowed.includes(column) ? { column, direction } : fallback;
}

/**
 * Pagination metadata attached to every list response.
 *
 * @typedef {object} PageMeta
 * @property {number} page
 * @property {number} limit
 * @property {number} total
 * @property {number} totalPages
 * @property {boolean} hasNext
 * @property {boolean} hasPrev
 */

/**
 * Build the pagination meta object used by every list response.
 *
 * `totalPages` is never below 1 so templates can render page 1 of 1 rather than
 * "page 1 of 0" for an empty collection.
 *
 * @param {number} page - 1-based page number.
 * @param {number} limit - Rows per page.
 * @param {number} total - Total matching rows.
 * @returns {PageMeta}
 */
export function buildMeta(page, limit, total) {
	const totalPages = Math.max(1, Math.ceil(total / limit));
	return {
		page,
		limit,
		total,
		totalPages,
		hasNext: page < totalPages,
		hasPrev: page > 1,
	};
}

/**
 * Clamp a requested page/limit pair to sane bounds.
 *
 * @param {unknown} page
 * @param {unknown} limit
 * @returns {{ page: number, limit: number }}
 */
export function normalisePaging(page, limit) {
	const parsedPage = Number(page);
	const parsedLimit = Number(limit);
	return {
		page:
			Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
		limit:
			Number.isInteger(parsedLimit) && parsedLimit > 0
				? Math.min(parsedLimit, MAX_LIMIT)
				: config.ui.pageSize,
	};
}

/**
 * Offset for a given page and page size.
 *
 * @param {number} page
 * @param {number} limit
 * @returns {number}
 */
export function offsetFor(page, limit) {
	return (page - 1) * limit;
}

/**
 * Extract `filter[field]=value` pairs from a query object.
 *
 * Nested keys survive Express' query parser intact, so `?filter[status]=draft`
 * arrives as the literal key `"filter[status]"`. Underscored entity field names
 * (`filter[mother_category]`) therefore need no special handling.
 *
 * @param {Record<string, unknown>} query
 * @returns {Record<string, unknown>}
 */
export function extractFilters(query) {
	/** @type {Record<string, unknown>} */
	const filters = {};
	for (const [key, value] of Object.entries(query ?? {})) {
		if (key.startsWith("filter[") && key.endsWith("]")) {
			filters[key.slice("filter[".length, -1)] = value;
		}
	}
	return filters;
}

/**
 * Apply the standard free-text search across a set of columns.
 *
 * Terms are `LIKE`-escaped, so searching for `50%` matches a literal `50%`
 * instead of every row.
 *
 * @param {import('knex').QueryBuilder} builder
 * @param {string|undefined} q - Search term; ignored when blank.
 * @param {readonly string[]} columns - Columns to search.
 */
export function applySearch(builder, q, columns) {
	const term = escapeLike(q ?? "");
	if (!term || columns.length === 0) return;
	const pattern = `%${term}%`;
	builder.andWhere((nested) => {
		for (const column of columns) {
			nested.orWhere(column, "like", pattern);
		}
	});
}