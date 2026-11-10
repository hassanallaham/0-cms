/**
 * @file Delete the local SQLite database so `db:reset` starts from nothing.
 *
 * Removing only the main file is not enough: the database runs in WAL mode, so
 * `db.sqlite-wal` and `db.sqlite-shm` sit beside it. Leave them behind and the
 * fresh database inherits stale sidecars, SQLite quietly refuses the new writes,
 * and the next boot reports "No schema found" even though the migration said it
 * ran. All three have to go together.
 *
 * @module bin/reset-db
 */

import { rmSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "../config/index.js";

const url = config.db.url;
const base = url.replace(/^file:/, "");
const paths = [base, `${base}-wal`, `${base}-shm`, `${base}-journal`];

for (const path of paths) {
	rmSync(resolve(path), { force: true });
}

console.log(`Removed ${paths.length} database file(s) for ${base}`);
