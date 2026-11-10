/**
 * @file Handlebars helper registry.
 *
 * A single flat namespace — templates call `{{truncate title 60}}` rather than
 * `{{string.truncate title 60}}`. Each helper is re-exported from one focused
 * module so the implementation stays readable and testable on its own.
 *
 * @module helpers
 */

import * as logic from "./logic.helpers.js";
import * as date from "./date.helpers.js";
import * as str from "./string.helpers.js";
import * as num from "./number.helpers.js";
import * as arr from "./array.helpers.js";
import * as iter from "./iteration.helpers.js";
import * as form from "./form.helpers.js";
import * as urls from "./url.helpers.js";
import * as theme from "./theme.helpers.js";
import * as pag from "./pagination.helpers.js";
import * as ui from "./ui.helpers.js";

// ── Logic ────────────────────────────────────────────────────────────────────
export const eq = logic.eq;
export const ne = logic.ne;
export const gt = logic.gt;
export const gte = logic.gte;
export const lt = logic.lt;
export const lte = logic.lte;
export const and = logic.and;
export const or = logic.or;
export const not = logic.not;
export const includes = logic.includes;
export const defaultValue = logic.defaultValue;

// ── Dates ────────────────────────────────────────────────────────────────────
export const formatDate = date.formatDate;
export const formatDateTime = date.formatDateTime;
export const timeAgo = date.timeAgo;
export const isExpired = date.isExpired;

// ── Strings ──────────────────────────────────────────────────────────────────
export const capitalize = str.capitalize;
export const lowercase = str.lowercase;
export const uppercase = str.uppercase;
export const truncate = str.truncate;
export const slugify = str.slugify;
export const concat = str.concat;
export const initials = str.initials;
export const urlEncode = str.urlEncode;

// ── Numbers ──────────────────────────────────────────────────────────────────
export const formatNumber = num.formatNumber;
export const formatFileSize = num.formatFileSize;
export const padNumber = num.padNumber;

// ── Arrays ───────────────────────────────────────────────────────────────────
export const length = arr.length;
export const first = arr.first;
export const last = arr.last;
export const join = arr.join;
export const json = arr.json;
export const pluck = arr.pluck;
export const array = arr.array;
export const hash = arr.hash;

// ── Iteration ────────────────────────────────────────────────────────────────
export const times = iter.times;
export const range = iter.range;

// ── Forms ────────────────────────────────────────────────────────────────────
export const selected = form.selected;
export const checked = form.checked;
export const old = form.old;
export const hasError = form.hasError;
export const fieldError = form.fieldError;

// ── URLs ─────────────────────────────────────────────────────────────────────
export const url = urls.url;
export const query = urls.query;
export const isActive = urls.isActive;
export const isActiveExact = urls.isActiveExact;
export const asset = urls.asset;
export const blobUrl = urls.blobUrl;
export const paginationUrl = urls.paginationUrl;
export const sortUrl = urls.sortUrl;
export const sortIndicator = urls.sortIndicator;

// ── Theme ────────────────────────────────────────────────────────────────────
export const themeAttribute = theme.themeAttribute;
export const themeIcon = theme.themeIcon;
export const themeLabel = theme.themeLabel;
export const oppositeTheme = theme.oppositeTheme;

// ── Pagination ───────────────────────────────────────────────────────────────
export const pageRange = pag.pageRange;
export const pagination = pag.pagination;

// ── UI ───────────────────────────────────────────────────────────────────────
export const badge = ui.badge;
export const statusBadge = ui.statusBadge;
export const statusLabel = ui.statusLabel;
export const booleanLabel = ui.booleanLabel;
export const chip = ui.chip;
export const icon = ui.icon;
export const avatar = ui.avatar;
export const mimetypeIcon = ui.mimetypeIcon;
export const mimeLabel = ui.mimeLabel;
export const isImage = ui.isImage;
export const spinner = ui.spinner;