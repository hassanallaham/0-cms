/**
 * @file Date and time helpers.
 * @module helpers/date
 */

import { toDate } from "./_utils.js";

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * Format a date as `YYYY-MM-DD` in local time.
 * @param {Date|string|number|null|undefined} value
 * @returns {string}
 */
export function formatDate(value) {
	const d = toDate(value);
	if (!d) return "";
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Format a date as `YYYY-MM-DD HH:mm` in local time.
 * @param {Date|string|number|null|undefined} value
 * @returns {string}
 */
export function formatDateTime(value) {
	const d = toDate(value);
	if (!d) return "";
	return `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Human-readable relative time ("3 minutes ago", "2 days ago").
 * @param {Date|string|number|null|undefined} value
 * @returns {string}
 */
export function timeAgo(value) {
	const d = toDate(value);
	if (!d) return "";

	const sec = Math.floor((Date.now() - d.getTime()) / 1000);
	if (sec < 0) return "in the future";
	if (sec < 45) return "just now";

	const min = Math.floor(sec / 60);
	if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;

	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;

	const days = Math.floor(hr / 24);
	if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

	const months = Math.floor(days / 30);
	if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;

	const years = Math.floor(months / 12);
	return `${years} year${years === 1 ? "" : "s"} ago`;
}

/**
 * True if the given date is in the past.
 * @param {Date|string|number|null|undefined} value
 * @returns {boolean}
 */
export function isExpired(value) {
	const d = toDate(value);
	return d ? d.getTime() < Date.now() : false;
}
