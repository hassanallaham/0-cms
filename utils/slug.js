/**
 * @file Slug generation and de-duplication.
 * @module utils/slug
 */

import slugifyLib from "slugify";

/** Longest slug we will ever store. Keeps `slug` comfortably inside a TEXT index. */
const MAX_LENGTH = 120;

/**
 * Convert a human string into a URL-safe slug.
 *
 * `slugify` handles transliteration, diacritics and unicode punctuation; this
 * wrapper only adds the guarantees we depend on: ASCII-only output, bounded
 * length, and a predictable fallback when the input contains nothing usable
 * (for example `"???"` or `"   "`).
 *
 * @param {unknown} value - Source text, typically a `name` or `title`.
 * @param {string} [fallback='item'] - Used when no slug characters survive.
 * @returns {string}
 */
export function slugify(value, fallback = "item") {
	const base = slugifyLib(String(value ?? ""), {
		lower: true,
		strict: true,
		trim: true,
	});
	if (base) return base.slice(0, MAX_LENGTH);
	return slugifyLib(fallback, { lower: true, strict: true }) || fallback;
}

/**
 * Find a slug that no other row currently holds.
 *
 * Slugs are the public URL of a record, so they must be unique. Titles and
 * names are allowed to repeat, which means a collision is expected rather than
 * exceptional: `My Post` becomes `my-post`, then `my-post-2`, `my-post-3`, …
 *
 * The numeric suffix is appended *after* truncation, so `uniqueSlug` can never
 * return something longer than {@link MAX_LENGTH} plus a short counter.
 *
 * @param {string} value - Source text to slugify.
 * @param {(candidate: string) => Promise<boolean>|boolean} isTaken
 *        Predicate returning `true` when a candidate slug is already in use.
 * @param {{ fallback?: string, attempts?: number }} [options]
 * @returns {Promise<string>}
 */
export async function uniqueSlug(
	value,
	isTaken,
	{ fallback = "item", attempts = 500 } = {},
) {
	const base = slugify(value, fallback);
	if (!(await isTaken(base))) return base;

	for (let suffix = 2; suffix <= attempts; suffix += 1) {
		const candidate = `${base}-${suffix}`;
		if (!(await isTaken(candidate))) return candidate;
	}

	// Pathological input (500 collisions on one name). Append entropy rather
	// than looping forever.
	return `${base}-${Date.now().toString(36)}`;
}