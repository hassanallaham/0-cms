/**
 * @file Number and file-size helpers.
 * @module helpers/number
 */

const numberFmt = new Intl.NumberFormat("en-US");

/**
 * Format a number with thousands separators.
 * @param {unknown} value
 * @returns {string}
 */
export function formatNumber(value) {
	const n = Number(value);
	return Number.isFinite(n) ? numberFmt.format(n) : "";
}

/**
 * Convert a byte count to a human-readable string (B, KB, MB, GB, TB).
 * @param {unknown} value
 * @returns {string}
 */
export function formatFileSize(value) {
	const n = Number(value);
	if (!Number.isFinite(n) || n < 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let v = n;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i += 1;
	}
	return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Left-pad a number with zeros.
 * @param {unknown} value
 * @param {number} width
 * @returns {string}
 */
export function padNumber(value, width) {
	const n = Number(value);
	const w = Number(width) || 0;
	if (!Number.isFinite(n)) return "";
	return String(Math.trunc(n)).padStart(w, "0");
}
