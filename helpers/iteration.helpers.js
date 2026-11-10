/**
 * @file Iteration helpers.
 * @module helpers/iteration
 */

/**
 * Block helper: repeats its body `n` times.
 * Exposes `{{index}}` and `{{count}}` inside the block.
 *
 * @example
 *   {{#times 3}}<i class="star"></i>{{/times}}
 *
 * @param {unknown} n
 * @param {Handlebars.HelperOptions} options
 * @returns {string}
 */
export function times(n, options) {
	const count = Math.max(0, Math.floor(Number(n) || 0));
	let out = "";
	for (let i = 0; i < count; i += 1) out += options.fn({ index: i, count });
	return out;
}

/**
 * Block helper: iterates integers from `start` (inclusive) to `end` (exclusive).
 * Exposes `{{value}}` and `{{index}}`.
 *
 * @param {unknown} start
 * @param {unknown} end
 * @param {Handlebars.HelperOptions} options
 * @returns {string}
 */
export function range(start, end, options) {
	const from = Number(start) || 0;
	const to = Number(end) || 0;
	let out = "";
	for (let i = from; i < to; i += 1)
		out += options.fn({ value: i, index: i });
	return out;
}
