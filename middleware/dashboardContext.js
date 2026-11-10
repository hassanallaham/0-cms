/**
 * @file View context for every dashboard page.
 *
 * Layouts and partials need to know the current path (to highlight the sidebar
 * and build URLs), the current query string (to preserve filters across
 * pagination and sorting), the active theme, and which layout to use. Rather
 * than repeating that in every controller, one middleware fills it in once.
 *
 * @module middleware/dashboardContext
 */

import { config } from "../config/index.js";
import { POST_STATUSES } from "../utils/renderers.js";

/** Layout used by all dashboard pages. */
const DASHBOARD_LAYOUT = "dashboard";

/**
 * The sidebar, in display order.
 *
 * Declared here rather than in the layout so every page highlights the right
 * entry from the same list. Counts are filled in by the dashboard page, which is
 * the only place that already runs the counts query.
 *
 * @type {ReadonlyArray<{ key: string, label: string, href: string, icon: string }>}
 */
const NAV_ITEMS = Object.freeze([
	{ key: "dashboard", label: "Dashboard", href: "/v1/web", icon: "dashboard" },
	{ key: "posts", label: "Posts", href: "/v1/web/posts", icon: "posts" },
	{ key: "categories", label: "Categories", href: "/v1/web/categories", icon: "category" },
	{ key: "tags", label: "Tags", href: "/v1/web/tags", icon: "tags" },
	{ key: "types", label: "Types", href: "/v1/web/types", icon: "types" },
	{ key: "files", label: "Files", href: "/v1/web/files", icon: "file" },
]);

/**
 * Only query keys that are safe to echo back into a form. Anything else the
 * browser sent is ignored rather than reflected.
 *
 * @type {readonly string[]}
 */
const KNOWN_QUERY_KEYS = [
	"page",
	"limit",
	"sort",
	"q",
	"status",
	"mimetype",
	"root",
	"filter[status]",
	"filter[category]",
	"filter[type]",
	"filter[tag]",
	"filter[root]",
	"filter[mimetype]",
	"filter[mother_category]",
	"filter[name]",
];

/**
 * Pick the theme: an explicit `?theme=` override, then the cookie, then the
 * configured default.
 *
 * @param {import('express').Request} req
 * @returns {'dark'|'light'}
 */
function resolveTheme(req) {
	const requested = String(req.query?.theme ?? "").toLowerCase();
	if (requested === "dark" || requested === "light") return requested;
	const fromCookie = String(req.cookies?.[config.ui.themeCookie] ?? "").toLowerCase();
	if (fromCookie === "dark" || fromCookie === "light") return fromCookie;
	return config.ui.defaultTheme;
}

/**
 * Build the theme cookie options.
 *
 * @param {import('express').Response} res
 * @returns {import('express').CookieOptions}
 */
export function themeCookieOptions(res) {
	return {
		path: "/",
		httpOnly: false,
		sameSite: "lax",
		maxAge: 365 * 24 * 60 * 60 * 1000,
		overwrite: true,
	};
}

/**
 * Persist a theme choice.
 *
 * @param {'dark'|'light'} theme
 * @param {import('express').Response} res
 */
export function setThemeCookie(theme, res) {
	res.cookie(config.ui.themeCookie, theme, themeCookieOptions(res));
}

/**
 * Populate `res.locals` for every rendered view.
 *
 * @returns {import('express').RequestHandler}
 */
/**
 * Bracket-notation query keys, flattened for Handlebars.
 *
 * `filter[root]` cannot be written as a Handlebars path — the grammar allows a
 * bracket segment, but not nested brackets — so the values are unpacked once here
 * and templates read `filters.root` instead.
 *
 * @type {readonly string[]}
 */
const FILTER_KEYS = Object.freeze([
	"status",
	"name",
	"root",
	"title",
	"mimetype",
	"mother_category",
]);

/**
 * Sort choices offered by the shared filter bar, in display order.
 * @type {ReadonlyArray<{ value: string, label: string }>}
 */
const SORT_OPTIONS = Object.freeze([
	{ value: "name", label: "Name (A→Z)" },
	{ value: "-name", label: "Name (Z→A)" },
	{ value: "created_at", label: "Oldest first" },
	{ value: "-created_at", label: "Newest first" },
	{ value: "-updated_at", label: "Recently updated" },
	{ value: "title", label: "Title (A→Z)" },
	{ value: "-title", label: "Title (Z→A)" },
	{ value: "size", label: "Largest file" },
]);

export function dashboardContext() {
	return (req, res, next) => {
		const query = /** @type {Record<string, unknown>} */ ({ ...req.query });

		/** @type {Record<string, unknown>} */
		const safeQuery = {};
		for (const key of KNOWN_QUERY_KEYS) {
			const value = query[key];
			if (value !== undefined && value !== "") safeQuery[key] = value;
		}

		const theme = resolveTheme(req);

		res.locals.currentPath = req.path;
		res.locals.query = safeQuery;
		res.locals.rawQuery = query;
		res.locals.theme = theme;
		res.locals.layout = DASHBOARD_LAYOUT;
		res.locals.statuses = POST_STATUSES;
		res.locals.pageSize = config.ui.pageSize;
		res.locals.navItems = NAV_ITEMS;
		res.locals.markdownTypeList = config.ui.markdownTypes.join(", ") || "(none)";
		res.locals.sortOptions = SORT_OPTIONS;

		/** @type {Record<string, string>} */
		const filters = {};
		for (const key of FILTER_KEYS) {
			const flat = safeQuery[`filter[${key}]`];
			if (flat !== undefined) filters[key] = String(flat);
		}
		res.locals.filters = filters;

		next();
	};
}