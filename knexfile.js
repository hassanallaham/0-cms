/**
 * @file Knex CLI configuration.
 *
 * Used by the `knex` CLI (`npm run migrate`, `npm run seed`) to locate the
 * migrations and seeds directories and to open a connection with the same
 * settings the app uses. The app itself imports the shared instance from
 * `db/knex.js`; this file exists only so the CLI can find them.
 *
 * @see https://knexjs.org/guide/migrations.html
 *
 * @module knexfile
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { config } from "./config/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Apply the pragmas Bloger depends on. SQLite ignores foreign keys unless they
 * are switched on per connection, and `better-sqlite3` hands out a fresh
 * connection whenever the pool grows, so this has to run every time.
 *
 * @param {import('better-sqlite3').Database} conn - Raw driver connection.
 */
function tuneConnection(conn) {
	conn.pragma("foreign_keys = ON");
	conn.pragma("journal_mode = WAL");
	conn.pragma("synchronous = NORMAL");
	conn.pragma("busy_timeout = 5000");
}

/**
 * Single shared configuration. `NODE_ENV` is already baked into `config`, so
 * there is nothing to key by environment.
 *
 * @type {import('knex').Knex.Config}
 */
const base = {
	client: "better-sqlite3",
	connection: { filename: config.db.url },
	useNullAsDefault: true,
	pool: {
		// SQLite has a single writer. One connection keeps writes serialised and
		// removes any chance of SQLITE_BUSY under normal local use.
		min: 1,
		max: 1,
		afterCreate: (conn, done) => {
			try {
				tuneConnection(conn);
				done(null, conn);
			} catch (err) {
				done(err, conn);
			}
		},
	},
	migrations: {
		directory: resolve(__dirname, "db", "migrations"),
		extension: "js",
		tableName: "knex_migrations",
	},
	seeds: {
		directory: resolve(__dirname, "db", "seeds"),
		extension: "js",
	},
};

export default base;