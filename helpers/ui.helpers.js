/**
 * @file UI presentation helpers (icons, badges, chips, placeholders).
 * @module helpers/ui
 */

import { safe, esc, isOptions } from "./_utils.js";
import { ICONS } from "./icons.js";
import { mimetypeLabel } from "../utils/storage.js";
import { statusInfo } from "../utils/renderers.js";
import { initials as buildInitials } from "./string.helpers.js";

/** Accepted badge colour variants. */
const BADGE_VARIANTS = new Set([
	"neutral",
	"success",
	"warning",
	"danger",
	"info",
]);

/**
 * Render an inline SVG by name. Unknown names render nothing.
 *
 * @param {string} name
 * @param {number} [size]
 * @returns {Handlebars.SafeString|string}
 */
export function icon(name, size) {
	const definition = ICONS[name];
	if (!definition) return "";
	if (!size) return safe(definition);
	return safe(definition.replace(/width="\d+"/, `width="${size}"`).replace(/height="\d+"/, `height="${size}"`));
}

/**
 * Render a coloured badge.
 *
 * Usage: `{{badge "Draft"}}` or `{{badge "Draft" "info"}}`.
 *
 * @param {string|number} text
 * @param {string} [variant='neutral']
 * @returns {Handlebars.SafeString}
 */
export function badge(text, variant) {
	const requested = isOptions(variant) || variant === undefined || variant === null ? "neutral" : String(variant);
	const safeVariant = BADGE_VARIANTS.has(requested) ? requested : "neutral";
	return safe(`<span class="badge badge--${safeVariant}">${esc(text)}</span>`);
}

/**
 * Plain-text label for a status, for use inside `<option>` and table cells where
 * a badge would be noise.
 *
 * @param {unknown} value - A `posts.status`.
 * @returns {string}
 */
export function statusLabel(value) {
	return statusInfo(value).label;
}

/**
 * Render a lifecycle status as a badge, using its canonical colour.
 *
 * @param {unknown} value - A `posts.status`.
 * @returns {Handlebars.SafeString}
 */
export function statusBadge(value) {
	const info = statusInfo(value);
	return safe(
		`<span class="badge badge--${info.variant}">${esc(info.label)}</span>`,
	);
}

/**
 * Render a boolean as a badge.
 *
 * @param {unknown} value
 * @param {string} [trueLabel='Yes']
 * @param {string} [falseLabel='No']
 * @returns {Handlebars.SafeString}
 */
export function booleanLabel(value, trueLabel, falseLabel) {
	const yes = isOptions(trueLabel) || trueLabel === undefined || trueLabel === null ? "Yes" : String(trueLabel);
	const no = isOptions(falseLabel) || falseLabel === undefined || falseLabel === null ? "No" : String(falseLabel);
	return value ? badge(yes, "success") : badge(no, "neutral");
}

/**
 * Render a removable tag chip with an inline remove control.
 *
 * The chip is a `<span>`, not a `<button>`, because the surrounding form owns
 * submission; the remove control is a checkbox that a hidden companion input
 * reads from.
 *
 * @param {object} item - Row exposing the entity's label column.
 * @param {string} labelKey - Which column holds the display name.
 * @param {string} name - Name of the checkbox group, e.g. `tags`.
 * @param {string} id - Checkbox id (must be unique within the page).
 * @param {string} [href] - When present the label becomes a link.
 * @returns {Handlebars.SafeString}
 */
export function chip(item, labelKey, name, id, href) {
	if (!item) return "";
	const label = String(item[labelKey] ?? "");
	const action = href
		? `<a class="chip__link" href="${esc(href)}">${esc(label)}</a>`
		: `<span class="chip__link">${esc(label)}</span>`;
	return safe(
		`<span class="chip">${action}` +
			`<label class="chip__remove" for="${esc(id)}" title="Remove">` +
			`<input type="checkbox" id="${esc(id)}" name="${esc(name)}" value="${esc(item.id)}">` +
			`<span aria-hidden="true">${ICONS.close}</span>` +
			`<span class="sr-only">Remove ${esc(label)}</span>` +
			`</label></span>`,
	);
}

/**
 * Render an icon chosen from a file's mimetype.
 *
 * @param {string|null|undefined} mimetype
 * @returns {Handlebars.SafeString}
 */
export function mimetypeIcon(mimetype) {
	const type = String(mimetype ?? "");
	/** @type {Record<string, string>} */
	const byMajor = {
		image: "file-image",
		text: "file-text",
		audio: "file",
		video: "file",
	};
	const major = type.split("/")[0];
	const name = byMajor[major] ?? (type.includes("zip") ? "file-archive" : "file");
	return safe(ICONS[name] ?? ICONS.file);
}

/**
 * Human-readable label for a mimetype: `image/jpeg` → `JPEG`.
 *
 * @param {string|null|undefined} mimetype
 * @returns {string}
 */
export function mimeLabel(mimetype) {
	return mimetypeLabel(mimetype);
}

/**
 * True when a mimetype can be shown inline in an `<img>`.
 *
 * @param {string|null|undefined} mimetype
 * @returns {boolean}
 */
export function isImage(mimetype) {
	return String(mimetype ?? "").startsWith("image/");
}

/**
 * Circular monogram used wherever an entity has no photo.
 *
 * Generated as an inline SVG so there is no placeholder image to ship or cache,
 * and it inherits the theme's accent colour.
 *
 * @param {string|null|undefined} label - Entity name or title.
 * @param {number} [size=40]
 * @returns {Handlebars.SafeString}
 */
export function avatar(label, size) {
	const dimension = Number(size) || 40;
	const text = buildInitials(label);
	return safe(
		`<svg class="avatar" width="${dimension}" height="${dimension}" viewBox="0 0 40 40" ` +
			`role="img" aria-label="${esc(label ?? "no image")}" focusable="false">` +
			`<circle cx="20" cy="20" r="20" fill="currentColor" opacity="0.12"/>` +
			`<text x="20" y="20" text-anchor="middle" dominant-baseline="central" ` +
			`font-size="15" font-weight="600" fill="currentColor" font-family="system-ui,sans-serif">` +
			`${esc(text)}</text></svg>`,
	);
}

/**
 * Render a loading spinner placeholder.
 *
 * @returns {Handlebars.SafeString}
 */
export function spinner() {
	return safe(
		'<span class="spinner" role="status" aria-label="Loading"></span>',
	);
}