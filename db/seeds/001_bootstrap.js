/**
 * @file Bootstrap seed.
 *
 * Idempotent — safe to run repeatedly. Creates the two post `types` that make the
 * renderer choice meaningful on a fresh install:
 *
 *   - `article` → rendered as Markdown (see `MARKDOWN_TYPES` in `.env`)
 *   - `note`    → rendered as escaped plain text
 *
 * Everything else is created by the user.
 *
 * @module db/seeds/001_bootstrap
 */

import { slugify } from "../../utils/slug.js";
import { logger } from "../../utils/logger.js";

/**
 * Seed rows, in creation order.
 *
 * @type {ReadonlyArray<{ name: string, description: string }>}
 */
const TYPES = Object.freeze([
	{ name: "Article", description: "Long-form writing rendered as Markdown." },
	{ name: "Note", description: "Short working note rendered as plain text." },
]);

/**
 * Insert the seed data.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export async function seed(knex) {
	let created = 0;

	for (const entry of TYPES) {
		const slug = slugify(entry.name);
		const existing = await knex("types").where({ slug }).first("id");
		if (existing) continue;

		await knex("types").insert({
			name: entry.name,
			slug,
		});
		created += 1;
	}

	logger.info({ created }, "seed: bootstrap complete");
}

export default seed;