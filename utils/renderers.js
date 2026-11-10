/**
 * @file Post content rendering.
 *
 * A post's `type` decides how `posts.content` is presented. Types whose slug
 * appears in `MARKDOWN_TYPES` are rendered as Markdown; every other type is shown
 * as escaped plain text. This keeps the renderer set configurable at runtime
 * without a plugin system or a per-type code path.
 *
 * @module utils/renderers
 */

import Handlebars from "handlebars";
import { marked } from "marked";

import { config } from "../config/index.js";

/**
 * Lifecycle status of a post, with the presentation metadata the UI needs.
 *
 * @typedef {{ value: string, label: string, variant: 'neutral'|'info'|'success' }} StatusInfo
 */

/** @type {Readonly<Record<string, StatusInfo>>} */
const STATUS = Object.freeze({
	draft: { value: "draft", label: "Draft", variant: "neutral" },
	needs_work: { value: "needs_work", label: "Needs work", variant: "info" },
	published: { value: "published", label: "Published", variant: "success" },
});

/**
 * All valid `posts.status` values.
 * @type {readonly string[]}
 */
export const POST_STATUSES = Object.freeze(Object.keys(STATUS));

/**
 * Describe a lifecycle status for display.
 *
 * @param {unknown} value
 * @returns {StatusInfo}
 */
export function statusInfo(value) {
	return STATUS[String(value ?? "")] ?? STATUS.draft;
}

/**
 * Escape a string for literal HTML text.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
	return Handlebars.escapeExpression(value == null ? "" : String(value));
}

/**
 * True when a type slug should be rendered as Markdown.
 *
 * @param {unknown} typeSlug
 * @returns {boolean}
 */
export function isMarkdownType(typeSlug) {
	if (!typeSlug) return false;
	return config.ui.markdownTypes.includes(String(typeSlug).toLowerCase());
}

/**
 * Render post content to HTML.
 *
 * Markdown types go through `marked`. Everything else — notes, raw logs, source
 * listings — is escaped and wrapped in a `<pre>` so whitespace and special
 * characters survive verbatim. Empty input yields an empty string.
 *
 * @param {unknown} content - Raw `posts.content`.
 * @param {unknown} [typeSlug] - The post's `types.slug`.
 * @returns {string} Trusted HTML, safe to insert with triple-stache.
 */
export function renderContent(content, typeSlug) {
	const text = content == null ? "" : String(content);
	if (!text.trim()) return "";

	if (isMarkdownType(typeSlug)) {
		return marked.parse(text, { async: false, gfm: true, breaks: true });
	}

	return `<pre class="prose-plain">${escapeHtml(text)}</pre>`;
}