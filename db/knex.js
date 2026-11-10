/**
 * @file The shared Knex instance.
 *
 * Both the application and the test suite talk to SQLite through this single
 * object. Foreign keys, WAL journalling and the busy timeout are applied to every
 * new connection by `knexfile.js`.
 *
 * @module db/knex
 */

import knex from "knex";

import baseConfig from "../knexfile.js";
import { logger } from "../utils/logger.js";

/**
 * Query-builder instance.
 *
 * @type {import('knex').Knex}
 */
export const db = knex(baseConfig);

/**
 * The current UTC instant, as an ISO-8601 string, evaluated by SQLite.
 *
 * SQLite's built-in `now()` yields `YYYY-MM-DD HH:MM:SS`, which is neither
 * ISO-8601 nor unambiguous — a reader cannot tell it is UTC. The spec requires
 * timestamps to be *returned as stored* ISO-8601 strings, so both the column
 * defaults and every write use this expression instead and the value is already
 * in the right shape when it reaches the JSON envelope.
 *
 * @returns {import('knex').Knex.Raw}
 */
export function utcNow() {
	return db.raw("strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
}

/**
 * Verify the database is reachable. Called at boot before the HTTP server
 * starts listening so a broken path fails loudly and early.
 *
 * @returns {Promise<void>}
 */
export async function pingDatabase() {
	await db.raw("SELECT 1");
}

/**
 * Close the connection pool. Called on graceful shutdown.
 *
 * @returns {Promise<void>}
 */
export async function closeDatabase() {
	await db.destroy();
	logger.debug("database pool closed");
}

export default db;