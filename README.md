# Blogger — Documentation

## 1. Introduction

Blogger is a **local-only**, single-user web application for organising writing and its accompanying files. It provides a JSON API (`/v1/json`) and a server-rendered Handlebars dashboard (`/v1/web`) to manage categories, tags, types, posts and files, including directed relations between posts and between files.

It is designed to be low-resource, has no build step, no authentication/authorisation, and stores everything in a local SQLite database with content-addressed file uploads.

## 2. Technology Stack

### Runtime & Framework

- **Node.js** ≥ 22 (verified on v24), ESM-only (`"type": "module"`)
- **Express 5** (5.2.1) — HTTP server, routing, middleware
- **Handlebars** (4.7.9) + **express-handlebars** (9.0.1) + **@handlebars/allow-prototype-access** (1.0.5) — server-rendered views

### Data & Storage

- **SQLite** via **better-sqlite3** (13.0.3)
- **Knex.js** (3.3.0) — schema migrations, seeds, query builder
- **Multer** (2.4.0) — multipart file uploads to disk
- Content-addressed storage: SHA-256 of upload bytes, stored under `files/YYYY/MM/<uuid>.<ext>`; deduplication reuses existing rows

### Validation, Parsing & Utilities

- **Zod** (4.6.5) — JSON/body validation
- **marked** (18.0.14) — Markdown → HTML for post content
- **slugify** (1.6.9) — generate unique slugs
- **method-override** (3.0.0) — `_method=PUT|DELETE` in body/query for HTML forms

### Logging & Observability

- **pino** (10.3.1), **pino-http** (11.0.0), **pino-pretty** (13.1.3, dev)

### Testing

- **Vitest** (5.0.3) — test runner
- **Supertest** (7.3.1) — HTTP assertions against the Express app

## 3. Project Structure

```
blogger/
├── app.js                # Express app setup, middleware, route mounting, storage/static
├── bin/
│   ├── www               # HTTP server bootstrap (creates storage layout, listens)
│   └── reset-db.js       # Removes SQLite DB + WAL sidecars and exits
├── config/
│   └── index.js          # Environment loading (dotenv, defaults)
├── db/
│   ├── knex.js           # Knex instance + helpers (utcNow)
│   ├── migrations/0001_init.js
│   └── seeds/0001_seed.js
├── helpers/              # Handlebars helpers (formatters, badges, blobs, etc.)
├── middleware/           # respond.js, validate.js, errorHandler.js, upload.js, parseId.js
├── modules/              # Feature modules (categories, tags, types, posts, files, lookup, health)
│   ├── */*.routes.js    # JSON API routes (/v1/json/...)
│   ├── */*.web.routes.js # Dashboard routes (/v1/web/...)
│   ├── */*.service.js   # Business logic
│   ├── */*.repository.js# Data access (Knex)
│   └── */*.schema.js    # Zod validation schemas
├── public/               # Static assets (CSS, icons)
├── utils/                # refs, relation.schema, storage, query, errors, etc.
├── views/                # Handlebars templates (layouts, partials, pages)
├── tests/                # Vitest/Supertest suite
├── vitest.config.js      # Test configuration
└── SRS.md                # Software Requirements Specification
```

## 4. Prerequisites

- Node.js v22+ (recommended v24)
- npm (bundled with Node)

## 5. Installation

Clone the repository and install dependencies:

```bash
cd /home/hassan/Programs/blogger
npm install
```

## 6. Configuration

Configuration is read from environment variables (loaded via `dotenv` in `config/index.js`, without override). Defaults are suitable for local development.

| Variable       | Default       | Description                                       |
| -------------- | ------------- | ------------------------------------------------- |
| `NODE_ENV`     | `development` | Environment (`development`, `test`, `production`) |
| `PORT`         | `3111`        | HTTP port the server listens on                   |
| `DATABASE_URL` | `./db.sqlite` | SQLite database path (relative to project root)   |
| `FILES_DIR`    | `./storage`   | Root directory for stored blobs                   |
| `LOG_LEVEL`    | `info`        | Pino log level                                    |
| `HOST`         | `127.0.0.1`   | Bind address (loopback only)                      |

For tests, `vitest.config.js` sets `NODE_ENV=test`, `DATABASE_URL=./db.test.sqlite`, `FILES_DIR=./storage-test`, `LOG_LEVEL=silent` before importing app modules.

## 7. Database & Migrations

- Migrations: `db/migrations/0001_init.js` (schema, FKs, unique constraints, checks, category-cycle trigger, ISO timestamp defaults)
- Seeds: `db/seeds/0001_seed.js` (minimal seed data)
- Knex config: `knexfile.js` (uses better-sqlite3, migrations/seeds paths)

Scripts:

```bash
npm run db:migrate  # Apply latest migrations
npm run db:rollback # Roll back last migration
npm run db:seed     # Run seeds
npm run db:reset    # Remove DB + WAL/shm/journal, migrate, seed
```

Notes: Timestamps are stored/returned as ISO-8601 UTC strings (`YYYY-MM-DDTHH:MM:SSZ`).

## 8. Running the App

Development (with watch):

```bash
npm run dev
```

Production/start:

```bash
npm start
```

The server listens on `http://127.0.0.1:<PORT>` (default 3111). Static files from `FILES_DIR` are mounted at `/storage` (the `/storage/temp` path is not served).

## 9. API Surface

### JSON API — `/v1/json/*`

All JSON responses use envelopes:

- Success: `{ success: true, data, meta?, ... }`
- Error: `{ success: false, error: { code, message, details? } }`

Core resources: `categories`, `tags`, `types`, `posts`, `files`, `lookup`, `health`.

Key relation contracts (directed):

- **Posts**: `POST /:id/tags` `{tag}`, `POST /:id/files` `{file}`, `POST /:id/related` `{to_post}`, `GET /:id/related`, `GET /:id/referenced`, `DELETE /:id/related/:postId`, `DELETE /:id/tags/:tagId`, `DELETE /:id/files/:fileId`
- **Files**: `POST /:id/tags` `{tag}`, `POST /:id/posts` `{post}`, `POST /:id/related` `{to_file}`, `GET /:id/related`, `GET /:id/referenced`, `DELETE /:id/related/:fileId`, `DELETE /:id/tags/:tagId`, `DELETE /:id/posts/:postId`

Files: `POST /v1/json/files` (multipart, field `file`), `GET /v1/json/files/:id/download` (attachment with original filename), `DELETE /v1/json/files/:id` (refused if still referenced). Uploads return `{ success, deduplicated, data }`. Deduplication reuses existing row and applies requested links.

### Web Dashboard — `/v1/web/*`

Server-rendered Handlebars pages. Supports `_method=PUT|DELETE` in body or query string. Anchor-linked tabs on detail pages (CSS-only). Relation pickers submit human-friendly values (names/titles/ids resolved server-side). Forms re-render with errors preserving submitted values and picker options.

Detail pages use tabbed hubs (per SRS §8.4):

- **Post**: Related posts · Files · Posts pointing here · Tags
- **File**: Preview · Related files · Posts · Files pointing here · Tags
- **Category**: Posts · Files
- **Tag**: Posts · Files
- **Type**: Posts

## 10. Testing

The test suite uses Vitest + Supertest against real SQLite and real storage directories (isolated per run).

Run all tests:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

Test configuration highlights:

- `fileParallelism: false` (SQLite single-writer)
- Global setup creates fresh test DB + storage, migrates and seeds
- Per-file setup resets DB/files between tests
- Environment isolated via `vitest.config.js`

Current status: **134 tests passing** across 9 test files (JSON contracts, relations, categories, uploads, storage unit, dashboard, file relations, tabs).

## 11. Data Model Notes

- `posts.photo`, `categories.photo`, `tags.photo` store **file paths** (relative to `FILES_DIR`), never file IDs. Photo references accept numeric ID, stored path, or original filename (resolved via `resolvePhotoPath()`).
- Directed edges: `posts_posts` (from_post→to_post), `files_files` (from_file→to_file). `related` = outbound, `referenced` = inbound; they are never merged.
- Timestamps are UTC ISO-8601 strings in API responses.
- Slugs are unique, auto-generated with numeric suffix on collision.
- Category tree: self-parent and cycles prevented (service + DB trigger).

## 12. File Upload Rules

- Allowed MIME types validated; empty files rejected; traversal prevented.
- Stored as `files/YYYY/MM/<uuid>.<ext>` (UUID name; original name preserved as metadata).
- SHA-256 deduplication: identical bytes return existing row with `deduplicated: true` (200) and applied requested relations; temp blob discarded.
- On insert/link failure after row creation, compensation removes the inserted row and its blob.
- Bad relation references during upload discard the temporary upload (422).
- Static mount at `/storage`; `/storage/temp` is not served.

## 13. Error Handling

- JSON: operational errors mapped to appropriate status codes (400/404/409/422/500) with `{ success:false, error }` envelope.
- HTML: validation errors re-render forms with submitted values and preserved locals (pickers, previews, etc.); 404/422/500 render HTML error pages.
- `parseId` middleware enforces positive integer IDs (returns 422 on invalid).

## 14. Possible Features to Add

These are suggested enhancements (out of current scope but natural extensions):

- **Search & filtering UI**: global search across posts/files/tags/categories; advanced filters (date ranges, mimetypes, tags combinations)
- **Bulk operations**: multi-select posts/files to tag/move/delete in bulk
- **Image processing**: thumbnails/variants for cover images and file gallery; EXIF stripping
- **Post revisions/drafts history**: versioning with diff and restore
- **Soft deletes/trash**: recoverable deletion with retention
- **Export/backup**: one-click export of DB + storage as archive; import/restore
- **Tag management UX**: tag merging, renaming with propagation, tag cloud
- **Categories reorder/tree drag-drop**: visual reparenting in dashboard
- **Markdown preview**: live preview while editing posts
- **File metadata editing**: rename original_name (if desired), add description/alt text
- **Related suggestions**: auto-suggest related posts/files by tags/content
- **API keys/webhooks**: optional local API auth for external tools (if moving beyond single-user local-only)
- **Accessibility polish**: ARIA landmarks, keyboard shortcuts, focus management
- **Performance**: full-text search (FTS5), image lazy loading improvements, pagination tuning
- **Themes**: additional color schemes beyond dark/light toggle
- **Importers**: Markdown files import, RSS/OPML, or existing blog exports

## 15. Development Notes

- No build step — vanilla CSS/HTML/Handlebars served directly.
- CSS-only tabs via `:target` + `:has()` (no JavaScript required).
- All relation resolution prefers human names over IDs (P4). Tag inputs use get-or-create semantics on single-tag add; multi-tag assignment replaces the set.
- Form validation errors preserve picker options and submitted state via `reRenderWithErrors` (with extra `locals`).
- Database resets cleanly (removes DB + WAL/shm/journal). Tests run against isolated paths.

## 16. License & Author

Author: Hassan Allaham <hassanallaham@hotmail.com>
Version: 0.0.1
Environment: Local-only single-user application as specified.

---

For the canonical requirements, see `SRS.md`. For test coverage and behavior, see the `tests/` directory.
