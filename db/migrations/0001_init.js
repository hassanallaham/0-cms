/**
 * @file Initial schema.
 *
 * Creates the ten tables, their indexes, foreign keys and uniqueness rules.
 *
 * Notable decisions, all documented in SRS.md §4:
 *
 *  - **Hard deletes.** No `deleted_at` anywhere. Ownership columns cascade;
 *    reference columns (`posts.category`, `files.category`, `posts.type`,
 *    `categories.mother_category`) use `ON DELETE RESTRICT` so the application
 *    can refuse a delete that would orphan content.
 *  - **`mimetype` is plain indexed TEXT.** The permitted set is a runtime
 *    setting (`FILE_ALLOWED_MIME`), so it must not be baked into the DDL where
 *    editing `.env` would silently desynchronise the schema.
 *  - **`posts.title` is not unique**, only `posts.slug` is. Titles may repeat;
 *    slugs are de-duplicated by suffixing at the service layer.
 *  - **Join tables keep an `id` primary key** in addition to their composite
 *    uniqueness, so a single edge row can be addressed directly.
 *
 * SQLite resolves foreign keys at DML time, so table creation order is flexible;
 * parents are still created first for readability.
 *
 * @module db/migrations/0001_init
 */

/**
 * Default for `created_at` / `updated_at`.
 *
 * SQLite's `now()` produces `YYYY-MM-DD HH:MM:SS`, which is not ISO-8601 and
 * carries no timezone marker. Timestamps are returned as stored, so the default
 * itself has to be a real ISO-8601 UTC instant. See `db/knex.js#utcNow`.
 *
 * SQLite only accepts a constant or `CURRENT_TIMESTAMP` in a column default, so
 * the expression has to be parenthesised — a bare call is a syntax error.
 */
const ISO_UTC_DEFAULT = "(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))";

/**
 * Build the initial schema.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
	// ── categories ───────────────────────────────────────────────────────────
	// Self-referencing tree. `mother_category <> id` blocks direct
	// self-parenting; the trigger below blocks deeper loops.
	await knex.schema.createTable("categories", (table) => {
		table.increments("id").primary();
		table.string("name", 160).notNullable().unique();
		table.string("slug", 160).notNullable().unique().index();
		table.text("description").nullable().defaultTo(null);
		table.integer("mother_category")
			.nullable()
			.defaultTo(null)
			.index()
			.references("id")
			.inTable("categories")
			.onDelete("RESTRICT")
			.onUpdate("CASCADE");
		table.string("photo", 512).nullable().defaultTo(null);
		table.timestamp("created_at").notNullable().defaultTo(knex.raw(ISO_UTC_DEFAULT));
		table.timestamp("updated_at").notNullable().defaultTo(knex.raw(ISO_UTC_DEFAULT));

		table.check(
			"mother_category IS NULL OR mother_category <> id",
			[],
			"categories_not_self_parent",
		);
	});

	// Deep ancestry loop guard.
	//
	// Walks the proposed ancestor chain of NEW.mother_category and aborts if it
	// reaches the row being updated. Only UPDATE needs this: a freshly inserted
	// row has no descendants, so it cannot complete a cycle on its own.
	await knex.raw(`
    CREATE TRIGGER prevent_category_cycles
    BEFORE UPDATE OF mother_category ON categories
    FOR EACH ROW
    WHEN NEW.mother_category IS NOT NULL
    BEGIN
        SELECT RAISE(ABORT, 'Cyclic lineage: a category cannot be a descendant of itself')
        WHERE EXISTS (
            WITH RECURSIVE lineage(id) AS (
                SELECT NEW.mother_category
                UNION
                SELECT c.mother_category
                  FROM categories c
                  JOIN lineage l ON c.id = l.id
                 WHERE c.mother_category IS NOT NULL
            )
            SELECT 1 FROM lineage WHERE id = OLD.id
        );
    END;
  `);

	// ── types ────────────────────────────────────────────────────────────────
	// Selects the renderer for a post's content. See MARKDOWN_TYPES in .env.
	await knex.schema.createTable("types", (table) => {
		table.increments("id").primary();
		table.string("name", 80).notNullable().unique();
		table.string("slug", 80).notNullable().unique().index();
	});

	// ── tags ─────────────────────────────────────────────────────────────────
	await knex.schema.createTable("tags", (table) => {
		table.increments("id").primary();
		table.string("name", 120).notNullable().unique();
		table.string("slug", 140).notNullable().unique().index();
		table.text("description").nullable().defaultTo(null);
		table.string("photo", 512).nullable().defaultTo(null);
		table.timestamp("created_at").notNullable().defaultTo(knex.raw(ISO_UTC_DEFAULT));
		table.timestamp("updated_at").notNullable().defaultTo(knex.raw(ISO_UTC_DEFAULT));
	});

	// ── files ────────────────────────────────────────────────────────────────
	// Content-addressed: `hash` is the sha256 of the blob and is the primary
	// identity used for de-duplication. `path` is relative to FILES_DIR.
	await knex.schema.createTable("files", (table) => {
		table.increments("id").primary();
		table.integer("category")
			.nullable()
			.defaultTo(null)
			.index()
			.references("id")
			.inTable("categories")
			.onDelete("RESTRICT")
			.onUpdate("CASCADE");
		table.string("mimetype", 120).notNullable().index();
		table.string("original_name", 255).notNullable();
		table.string("stored_name", 255).notNullable();
		table.integer("size").notNullable();
		table.string("path", 512).notNullable().unique();
		table.string("hash", 64).notNullable().unique();
		table.timestamp("created_at").notNullable().defaultTo(knex.raw(ISO_UTC_DEFAULT));
		table.timestamp("updated_at").notNullable().defaultTo(knex.raw(ISO_UTC_DEFAULT));
	});

	// ── posts ────────────────────────────────────────────────────────────────
	await knex.schema.createTable("posts", (table) => {
		table.increments("id").primary();
		table.string("status", 20).notNullable().defaultTo("draft").index();
		table.integer("category")
			.nullable()
			.defaultTo(null)
			.index()
			.references("id")
			.inTable("categories")
			.onDelete("RESTRICT")
			.onUpdate("CASCADE");
		table.string("title", 300).notNullable();
		table.string("slug", 160).notNullable().unique().index();
		table.integer("type")
			.nullable()
			.defaultTo(null)
			.index()
			.references("id")
			.inTable("types")
			.onDelete("RESTRICT")
			.onUpdate("CASCADE");
		table.string("photo", 512).nullable().defaultTo(null);
		table.text("content").nullable().defaultTo(null);
		table.text("notes").nullable().defaultTo(null);
		table.timestamp("created_at").notNullable().defaultTo(knex.raw(ISO_UTC_DEFAULT));
		table.timestamp("updated_at").notNullable().defaultTo(knex.raw(ISO_UTC_DEFAULT));

		table.check(
			"status IN ('draft','needs_work','published')",
			[],
			"posts_status_valid",
		);
	});

	// ── join tables ──────────────────────────────────────────────────────────
	// All cascade on delete: removing a post removes its edges, never the things
	// the edges point at.

	/**
	 * @param {import('knex').Knex.TableBuilder} table
	 * @param {string} leftColumn
	 * @param {string} leftTable
	 * @param {string} rightColumn
	 * @param {string} rightTable
	 */
	const manyToMany = (table, leftColumn, leftTable, rightColumn, rightTable) => {
		table.increments("id").primary();
		table
			.integer(leftColumn)
			.notNullable()
			.index()
			.references("id")
			.inTable(leftTable)
			.onDelete("CASCADE")
			.onUpdate("CASCADE");
		table
			.integer(rightColumn)
			.notNullable()
			.index()
			.references("id")
			.inTable(rightTable)
			.onDelete("CASCADE")
			.onUpdate("CASCADE");
		table.timestamp("created_at").notNullable().defaultTo(knex.raw(ISO_UTC_DEFAULT));
		table.timestamp("updated_at").notNullable().defaultTo(knex.raw(ISO_UTC_DEFAULT));
		table.unique([leftColumn, rightColumn]);
	};

	await knex.schema.createTable("posts_tags", (table) =>
		manyToMany(table, "post", "posts", "tag", "tags"),
	);

	await knex.schema.createTable("files_tags", (table) =>
		manyToMany(table, "file", "files", "tag", "tags"),
	);

	await knex.schema.createTable("posts_files", (table) =>
		manyToMany(table, "post", "posts", "file", "files"),
	);

	// ── directed self-edges ───────────────────────────────────────────────────
	// `from_x → to_x` is a directed edge. `from_x` lists what the record points
	// at; `to_x` lists what points back at it. Self-edges are meaningless.

	await knex.schema.createTable("posts_posts", (table) => {
		manyToMany(table, "from_post", "posts", "to_post", "posts");
		table.check("from_post <> to_post", [], "posts_posts_no_self_edge");
	});

	await knex.schema.createTable("files_files", (table) => {
		manyToMany(table, "from_file", "files", "to_file", "files");
		table.check("from_file <> to_file", [], "files_files_no_self_edge");
	});
}

/**
 * Drop everything, children first.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
	await knex.raw("DROP TRIGGER IF EXISTS prevent_category_cycles");

	for (const table of [
		"files_files",
		"posts_posts",
		"posts_files",
		"posts_tags",
		"files_tags",
		"posts",
		"files",
		"tags",
		"types",
		"categories",
	]) {
		await knex.schema.dropTableIfExists(table);
	}
}