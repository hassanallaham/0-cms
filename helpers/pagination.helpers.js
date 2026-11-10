/**
 * @file Pagination helpers.
 * @module helpers/pagination
 *
 * Expects `@root.query` and `@root.currentPath` to be present (set by layout
 * middleware) so links preserve the current filters and search term.
 */

import { safe, esc } from "./_utils.js";

/**
 * Build a list of page numbers with `"…"` ellipsis markers.
 * @param {number} current
 * @param {number} total
 * @param {number} [windowSize=2]
 * @returns {Array<number|'...'>}
 */
export function pageRange(current, total, windowSize = 2) {
	const c = Math.max(1, Number(current) || 1);
	const t = Math.max(1, Number(total) || 1);
	const w = Math.max(0, Number(windowSize) || 0);

	const pages = [];
	const start = Math.max(1, c - w);
	const end = Math.min(t, c + w);

	if (start > 1) {
		pages.push(1);
		if (start > 2) pages.push("...");
	}
	for (let i = start; i <= end; i += 1) pages.push(i);
	if (end < t) {
		if (end < t - 1) pages.push("...");
		pages.push(t);
	}
	return pages;
}

/**
 * Render a full pagination bar. Returns empty string when there is only one page.
 * @param {{ page:number, totalPages:number, total:number, hasPrev:boolean, hasNext:boolean }} meta
 * @param {Handlebars.HelperOptions} options
 * @returns {Handlebars.SafeString|string}
 */
export function pagination(meta, options) {
	if (!meta || !meta.total || meta.totalPages <= 1) return "";

	const root = options?.data?.root ?? {};
	const path = root.currentPath ?? "";
	const currentQuery = root.query ?? {};

	const buildUrl = (page) => {
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries({ ...currentQuery, page })) {
			if (v == null || v === "") continue;
			params.append(k, v);
		}
		return `${path}?${params.toString()}`;
	};

	const items = [];

	if (meta.hasPrev) {
		items.push(
			`<a class="page-link" href="${esc(buildUrl(meta.page - 1))}" rel="prev" aria-label="Previous page">«</a>`,
		);
	} else {
		items.push(
			'<span class="page-link is-disabled" aria-hidden="true">«</span>',
		);
	}

	for (const p of pageRange(meta.page, meta.totalPages)) {
		if (p === "...") {
			items.push(
				'<span class="page-ellipsis" aria-hidden="true">…</span>',
			);
		} else if (p === meta.page) {
			items.push(
				`<span class="page-link is-current" aria-current="page">${esc(p)}</span>`,
			);
		} else {
			items.push(
				`<a class="page-link" href="${esc(buildUrl(p))}">${esc(p)}</a>`,
			);
		}
	}

	if (meta.hasNext) {
		items.push(
			`<a class="page-link" href="${esc(buildUrl(meta.page + 1))}" rel="next" aria-label="Next page">»</a>`,
		);
	} else {
		items.push(
			'<span class="page-link is-disabled" aria-hidden="true">»</span>',
		);
	}

	return safe(
		`<nav class="pagination" aria-label="Pagination">` +
			`<div class="pagination__pages">${items.join("")}</div>` +
			`<div class="pagination__info">Page ${esc(meta.page)} of ${esc(meta.totalPages)} · ${esc(meta.total)} total</div>` +
			`</nav>`,
	);
}
