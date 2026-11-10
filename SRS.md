# 0-CMS — Software Requirements Specification

**Version:** 1.0
**Status:** Approved for implementation
**Date:** 2026-10-02
**Author:** Hassan Allaham

---

## 1. Introduction

### 1.1 Purpose

This document specifies Bloger, a **local-only** web application for organising blog
posts and the files that accompany them. Bloger runs on the user's own laptop, serves a
single user, and exists to make the bookkeeping of a writing archive — categories, tags,
posts, types and files — fast and pleasant.

### 1.2 Scope

In scope:

- A Node.js / Express 5 web application with a Handlebars dashboard.
- A JSON API under `/v1/json` intended for a future separate front-end.
- CRUD, search, filter, sort and pagination over five entities.
- A directed graph of relations between posts and between files.
- Content-addressed file upload with de-duplication.
- A dark-default, fully responsive, light/dark themable UI.

Explicitly **out of scope**:

- Authentication, authorisation, sessions, users, roles, permissions.
- CSRF tokens, rate limiting, XSS hardening beyond ordinary template escaping.
- Multi-tenancy, remote deployment, horizontal scaling, caching layers.
- A revision/history table, trash/recycle bin, soft deletes.

### 1.3 Product principles

| #   | Principle                         | Consequence                                                         |
| --- | --------------------------------- | ------------------------------------------------------------------- |
| P1  | **Local first**                   | SQLite file, no external services, binds to loopback by default     |
| P2  | **Low resource use**              | No build step, no bundler, no framework runtime, vanilla client JS  |
| P3  | **Modern and obvious**            | Dark by default, responsive, keyboard-navigable, WYSIWYG-free forms |
| P4  | **Names, never IDs**              | A human always picks a relation by typing its name, never its id    |
| P5  | **Relationships are the product** | Every detail page is a hub with tabs into its neighbours            |

### 1.4 Definitions

| Term              | Meaning                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| **Entity**        | A top-level stored thing: category, tag, type, post, file                                          |
| **Join table**    | A many-to-many edge table: `posts_tags`, `posts_files`, `files_tags`, `posts_posts`, `files_files` |
| **Directed edge** | A row `from_X → to_X`; "related to" means outbound, "points to" means inbound                      |
| **Ref**           | A foreign-key value resolved either by id or by name                                               |
| **Slug**          | URL-safe, unique, human-readable identifier derived from `name` or `title`                         |

---

## 2. Technology constraints

### 2.1 Runtime

- Node.js ≥ 22 (developed and verified on v24). ESM only (`"type": "module"`).
- CommonJS `.cjs` is never used. No transpiler, no bundler.

### 2.2 Dependencies (fixed)

**Runtime**

| Package                              | Version         | Role                                    |
| ------------------------------------ | --------------- | --------------------------------------- |
| `express`                            | 5.2.1           | HTTP framework                          |
| `express-handlebars`                 | 9.0.1           | `.hbs` view engine with layouts         |
| `handlebars`                         | 4.7.9           | templating                              |
| `@handlebars/allow-prototype-access` | 1.0.5           | prototype access inside templates       |
| `better-sqlite3`                     | 13.0.3          | synchronous SQLite driver               |
| `knex`                               | 3.3.0           | query builder, migrations, seeds        |
| `multer`                             | 2.4.0           | multipart upload to disk                |
| `zod`                                | 4.6.5           | request validation                      |
| `marked`                             | 18.0.14         | Markdown → HTML for post content        |
| `slugify`                            | 1.6.9           | base slug generation                    |
| `method-override`                    | 3.0.0           | HTML-form `PUT`/`DELETE` emulation      |
| `cookie-parser`                      | 1.4.7           | reads the theme cookie                  |
| `dotenv`                             | 18.0.4          | `.env` loading                          |
| `pino` / `pino-http`                 | 10.3.1 / 11.0.0 | structured logging                      |
| `debug`                              | 4.4.3           | boot diagnostics                        |
| `http-errors`                        | 2.0.1           | retained, unused by the error hierarchy |
| `morgan`                             | 1.12.1          | retained, superseded by `pino-http`     |

**Development**

| Package       | Version | Role                    |
| ------------- | ------- | ----------------------- |
| `vitest`      | 5.0.3   | test runner             |
| `supertest`   | 7.3.1   | HTTP-level tests        |
| `pino-pretty` | 13.1.3  | human-readable dev logs |

### 2.3 Code conventions

- **JSDoc on every function, method and exported symbol** — `@param`, `@returns`,
  `@typedef` as applicable. Every file opens with a `@file` block naming its `@module`.
- Tabs for indentation, double-quoted strings, semicolons.
- ESM imports, always with explicit `.js` extensions.
- Files are named in camelCase except `*.routes.js` and `*.hbs`.

---

## 3. Architecture

### 3.1 Directory layout

```
blogger/
├── app.js                  Express app assembly
├── bin/www                 HTTP server, graceful shutdown
├── config/index.js         env loading + zod validation + frozen config
├── db/
│   ├── knex.js             shared Knex instance
│   ├── migrations/         0001_init.js
│   └── seeds/              001_bootstrap.js
├── knexfile.js             CLI configuration
├── middleware/
│   ├── dashboardContext.js res.locals for every web view
│   ├── errors.js           AppError hierarchy
│   ├── errorHandler.js     404 + terminal error handler
│   ├── flash.js            cookie-backed flash messages
│   └── parseId.js          :id → positive integer
├── modules/
│   ├── categories/  category.{controller,repository,routes,schema,service}.js
│   ├── tags/        tag.{...}.js
│   ├── types/       type.{...}.js
│   ├── posts/       post.{...}.js
│   ├── files/       file.{...}.js
│   ├── lookup/      lookup.{controller,routes}.js
│   └── dashboard/   dashboard.routes.js
├── routes/
│   ├── index.js      mounts /json and /web
│   ├── json.routes.js
│   └── web.routes.js
├── utils/
│   ├── logger.js     pino + pino-http
│   ├── helpers.js    booleanFromString, etc.
│   ├── query.js      parseSort, buildMeta, extractFilters
│   ├── refs.js       resolveRef, toIdList
│   ├── renderers.js  renderContent(content, typeSlug)
│   ├── slug.js       slugify, uniqueSlug
│   └── storage.js    hashing, atomic move, temp cleanup
├── helpers/          Handlebars helpers (flat re-exports)
├── views/
│   ├── layouts/      dashboard.hbs, blank.hbs
│   ├── partials/     sidebar, topbar, flash, …
│   ├── dashboard/home.hbs
│   ├── categories/{index,show,form}.hbs
│   ├── tags/{index,show,form}.hbs
│   ├── types/{index,show,form}.hbs
│   ├── posts/{index,show,form}.hbs
│   ├── files/{index,show}.hbs
│   └── error.hbs
├── public/
│   ├── javascripts/  dashboard.js, autocomplete.js
│   └── stylesheets/  main.css
├── storage/
│   ├── files/YYYY/MM/<uuid>.<ext>
│   └── temp/
└── tests/
```

### 3.2 Module contract

Every entity module is five files with a strict division of labour:

| File              | Responsibility                                                                        | Must never                                |
| ----------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| `*.schema.js`     | zod schemas; input shape, coercion, defaults                                          | touch the database                        |
| `*.repository.js` | every SQL statement; returns plain rows                                               | throw HTTP errors, know about `req`/`res` |
| `*.service.js`    | business rules; raises `AppError` subclasses; composes repositories                   | reference Express                         |
| `*.controller.js` | HTTP in/out; validates with the schema, delegates to the service, shapes the response | contain business rules                    |
| `*.routes.js`     | URL → handler wiring                                                                  | contain logic                             |

### 3.3 Two front doors

```
/v1
├── /json      → routes/json.routes.js   JSON in, JSON out
└── /web       → routes/web.routes.js    Handlebars views + HTML forms
```

Both front doors share one service layer. Business behaviour can never diverge between
them because neither front door contains logic.

### 3.4 Request pipeline

```
pino-http → json/urlencoded parsers → cookie-parser → express.static
          → /v1 router
              ├── /json → validate → service → repository → JSON envelope
              └── /web  → dashboardContext → flash → handler → render/redirect
          → notFoundHandler → errorHandler
```

---

## 4. Data model

All timestamps are `DATETIME NOT NULL DEFAULT (now())` and are maintained by the
application. All foreign keys use `ON UPDATE CASCADE`.

### 4.1 `categories`

Self-referencing tree.

| Column            | Type     | Null | Default       | Constraints                                       |
| ----------------- | -------- | ---- | ------------- | ------------------------------------------------- |
| `id`              | INTEGER  | no   | autoincrement | **PK**                                            |
| `name`            | TEXT     | no   | —             | UNIQUE                                            |
| `slug`            | TEXT     | no   | —             | UNIQUE, INDEX                                     |
| `description`     | TEXT     | yes  | NULL          |                                                   |
| `mother_category` | INTEGER  | yes  | NULL          | FK→`categories.id`, **ON DELETE RESTRICT**, INDEX |
| `photo`           | TEXT     | yes  | NULL          | path relative to `FILES_DIR`                      |
| `created_at`      | DATETIME | no   | now           |                                                   |
| `updated_at`      | DATETIME | no   | now           |                                                   |

- `CHECK (mother_category IS NULL OR mother_category <> id)`
- Trigger `prevent_category_cycles` — `BEFORE UPDATE OF mother_category`, walks the
  proposed ancestor chain with a recursive CTE and aborts if it reaches the row being
  updated. Self-reference is already impossible on `INSERT` because the new row has no
  descendants yet, so `UPDATE` alone is sufficient.

### 4.2 `files`

Content-addressed store.

| Column                      | Type     | Null | Default       | Constraints                                       |
| --------------------------- | -------- | ---- | ------------- | ------------------------------------------------- |
| `id`                        | INTEGER  | no   | autoincrement | **PK**                                            |
| `category`                  | INTEGER  | yes  | NULL          | FK→`categories.id`, **ON DELETE RESTRICT**, INDEX |
| `mimetype`                  | TEXT     | no   | —             | INDEX (validated by zod, **no** DB CHECK)         |
| `original_name`             | TEXT     | no   | —             | name as supplied by the user                      |
| `stored_name`               | TEXT     | no   | —             | basename on disk                                  |
| `size`                      | INTEGER  | no   | —             | bytes                                             |
| `path`                      | TEXT     | no   | —             | UNIQUE, relative to `FILES_DIR`                   |
| `hash`                      | TEXT     | no   | —             | UNIQUE, sha256 hex                                |
| `created_at` / `updated_at` | DATETIME | no   | now           |                                                   |

> **Design note.** `original_name`, `stored_name` and `size` are additions beyond the
> original field list. A bare `path` cannot show a human a readable filename or a file
> size, so all three are required by the UI.

> **Design note.** `mimetype` is a plain indexed `TEXT`, not a database enum. The set of
> permitted types is a _runtime_ setting (`FILE_ALLOWED_MIME`), and baking it into DDL
> would make the schema silently stale the moment `.env` changes. Enforcement happens in
> `file.schema.js` (zod enum built from config) and in the multer `fileFilter`.

### 4.3 `tags`

| Column                      | Type     | Null | Default       | Constraints   |
| --------------------------- | -------- | ---- | ------------- | ------------- |
| `id`                        | INTEGER  | no   | autoincrement | **PK**        |
| `name`                      | TEXT     | no   | —             | UNIQUE        |
| `slug`                      | TEXT     | no   | —             | UNIQUE, INDEX |
| `description`               | TEXT     | yes  | NULL          |               |
| `photo`                     | TEXT     | yes  | NULL          |               |
| `created_at` / `updated_at` | DATETIME | no   | now           |               |

### 4.4 `types`

| Column | Type    | Null | Default       | Constraints   |
| ------ | ------- | ---- | ------------- | ------------- |
| `id`   | INTEGER | no   | autoincrement | **PK**        |
| `name` | TEXT    | no   | —             | UNIQUE        |
| `slug` | TEXT    | no   | —             | UNIQUE, INDEX |

`types` carries no timestamps because the specification defines none. Seeded with
`article` (rendered as Markdown) and `note` (rendered as plain text).

### 4.5 `posts`

| Column                      | Type     | Null | Default       | Constraints                                          |
| --------------------------- | -------- | ---- | ------------- | ---------------------------------------------------- |
| `id`                        | INTEGER  | no   | autoincrement | **PK**                                               |
| `status`                    | TEXT     | no   | `'draft'`     | INDEX, `CHECK IN ('draft','needs_work','published')` |
| `category`                  | INTEGER  | yes  | NULL          | FK→`categories.id`, **ON DELETE RESTRICT**, INDEX    |
| `title`                     | TEXT     | no   | —             | **not unique**                                       |
| `slug`                      | TEXT     | no   | —             | UNIQUE, INDEX                                        |
| `type`                      | INTEGER  | yes  | NULL          | FK→`types.id`, **ON DELETE RESTRICT**, INDEX         |
| `photo`                     | TEXT     | yes  | NULL          |                                                      |
| `content`                   | TEXT     | yes  | NULL          | rendered per `type`                                  |
| `notes`                     | TEXT     | yes  | NULL          | private working notes, never rendered                |
| `created_at` / `updated_at` | DATETIME | no   | now           |                                                      |

`title` is deliberately **not** unique: two drafts may share a title. Uniqueness is
carried by `slug`, which is de-duplicated by suffixing (`my-post`, `my-post-2`, …).
`status` is a fixed application vocabulary rather than a configurable one, so a database
`CHECK` is appropriate here.

### 4.6 Join tables

All five use an `id` primary key (convenient for row-targeted deletes) in addition to the
specified composite uniqueness, and all five cascade on delete.

| Table         | Columns                | Composite unique       | Check                  |
| ------------- | ---------------------- | ---------------------- | ---------------------- |
| `posts_tags`  | `post`, `tag`          | `(post, tag)`          | —                      |
| `files_tags`  | `file`, `tag`          | `(file, tag)`          | —                      |
| `posts_files` | `post`, `file`         | `(post, file)`         | —                      |
| `posts_posts` | `from_post`, `to_post` | `(from_post, to_post)` | `from_post <> to_post` |
| `files_files` | `from_file`, `to_file` | `(from_file, to_file)` | `from_file <> to_file` |

### 4.7 Entity-relationship summary

```
categories ──< categories            (mother_category, RESTRICT, cycle-guarded)
categories ──< posts                 (RESTRICT)
categories ──< files                 (RESTRICT)
types      ──< posts                 (RESTRICT)
posts      >──< tags    via posts_tags
posts      >──< files   via posts_files
files      >──< tags    via files_tags
posts      ──▶ posts    via posts_posts   (directed)
files      ──▶ files   via files_files    (directed)
```

### 4.8 Deletion policy

Deletion is **hard**. There is no `deleted_at` column anywhere.

| Action                                                     | Result                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Delete a category that has sub-categories, posts, or files | **409 Conflict**, listing the blockers                                               |
| Delete a post                                              | Its tag/file/relation links cascade away; the referenced _files_ are **not** deleted |
| Delete a file                                              | Its links cascade away; the blob is unlinked from disk                               |
| Delete a tag or type                                       | Its links cascade away                                                               |

---

## 5. Configuration

Loaded from `.env` (see `.env.example`), validated by a zod schema in `config/index.js`.
The process exits with a readable report if anything is missing or malformed. Relative
paths are resolved against the project root, never the current working directory.

| Variable            | Type                            | Default                   | Meaning                         |
| ------------------- | ------------------------------- | ------------------------- | ------------------------------- |
| `NODE_ENV`          | `development｜test｜production` | `development`             | mode                            |
| `PORT`              | int 1–65535                     | `3000`                    | listen port                     |
| `APP_URL`           | url                             | `http://localhost:<PORT>` | canonical base URL              |
| `DATABASE_URL`      | path                            | `./db.sqlite`             | SQLite file                     |
| `FILES_DIR`         | path                            | `./storage`               | blob storage root               |
| `UPLOAD_MAX_MB`     | int 1–500                       | `10`                      | per-file size cap               |
| `FILE_ALLOWED_MIME` | csv                             | see `.env.example`        | permitted mimetypes             |
| `PAGE_SIZE`         | int 1–100                       | `10`                      | default list page size          |
| `DEFAULT_THEME`     | `dark｜light`                   | `dark`                    | theme before the cookie exists  |
| `MARKDOWN_TYPES`    | csv of type slugs               | `article`                 | types rendered as Markdown      |
| `LOG_LEVEL`         | pino level                      | `info`                    |                                 |
| `LOG_FORMAT`        | `json｜pretty`                  | `pretty`                  | `pretty` requires `pino-pretty` |

Exported shape: `{ env, isDev, isTest, isProd, app:{port,url}, db:{client,url},
files:{dir,maxBytes,maxMb,allowedMime}, ui:{pageSize,defaultTheme,markdownTypes,themeCookie},
log:{level,format} }`, deeply frozen.

There are no cookie, auth, mail, admin or rate-limit settings.

---

## 6. JSON API (`/v1/json`)

### 6.1 Conventions

- **Envelope.** Success: `{ "success": true, "data": …, "meta"?: {…} }`.
  Failure: `{ "success": false, "error": { "code", "message", "details"? } }`.
- **Status codes.** `200` read/update · `201` create · `204` delete ·
  `400` malformed · `404` missing · `409` conflict · `422` validation · `500` unexpected.
- **Pagination.** `?page=1&limit=10`. `meta` = `{ page, limit, total, totalPages,
hasNext, hasPrev }`.
- **Sorting.** `?sort=field` ascending, `?sort=-field` descending. Only whitelisted
  fields are honoured; anything else falls back to the default silently.
- **Search.** `?q=` — a case-insensitive `LIKE %q%` over the entity's text columns.
- **Filtering.** `?filter[field]=value`, validated per entity.
- **Timestamps** are returned as stored ISO-8601 strings.

### 6.2 Error codes

`BAD_REQUEST`, `NOT_FOUND`, `CONFLICT`, `VALIDATION_ERROR`,
`INTERNAL_SERVER_ERROR`.

### 6.3 Route catalogue

**Categories** — `/categories`

| Method | Path            | Purpose                                          |
| ------ | --------------- | ------------------------------------------------ |
| GET    | `/`             | list; filters `name`, `mother_category`, `root`  |
| GET    | `/:id`          | detail incl. `related: {children, posts, files}` |
| POST   | `/`             | create                                           |
| PATCH  | `/:id`          | partial update                                   |
| DELETE | `/:id`          | delete (409 when referenced)                     |
| GET    | `/:id/children` | sub-categories, paginated                        |
| GET    | `/:id/posts`    | posts in this category, paginated                |
| GET    | `/:id/files`    | files in this category, paginated                |

**Tags** — `/tags`

| Method               | Path                       |
| -------------------- | -------------------------- |
| GET / POST           | `/`                        |
| GET / PATCH / DELETE | `/:id`                     |
| GET                  | `/:id/posts`, `/:id/files` |

**Types** — `/types`

| Method               | Path         |
| -------------------- | ------------ |
| GET / POST           | `/`          |
| GET / PATCH / DELETE | `/:id`       |
| GET                  | `/:id/posts` |

**Posts** — `/posts`

| Method               | Path                      | Purpose                                           |
| -------------------- | ------------------------- | ------------------------------------------------- |
| GET                  | `/`                       | list; filters `status`, `category`, `type`, `tag` |
| GET / PATCH / DELETE | `/:id`                    |                                                   |
| GET                  | `/:id/tags`, `/:id/files` | linked tags / files                               |
| GET                  | `/:id/related`            | **outbound** edges (`from_post = :id`)            |
| GET                  | `/:id/referenced`         | **inbound** edges (`to_post = :id`)               |
| POST                 | `/:id/tags`               | body `{ "tag": <id> }`                            |
| DELETE               | `/:id/tags/:tagId`        |                                                   |
| POST                 | `/:id/files`              | body `{ "file": <id> }`                           |
| DELETE               | `/:id/files/:fileId`      |                                                   |
| POST                 | `/:id/related`            | body `{ "to_post": <id> }` → edge `:id → to_post` |
| DELETE               | `/:id/related/:postId`    | removes the outbound edge                         |

**Files** — `/files`

| Method | Path                                           | Purpose                                     |
| ------ | ---------------------------------------------- | ------------------------------------------- |
| GET    | `/`                                            | list; filters `category`, `mimetype`, `tag` |
| GET    | `/:id`                                         | detail                                      |
| PATCH  | `/:id`                                         | update `category` / links                   |
| DELETE | `/:id`                                         | delete row and unlink blob                  |
| POST   | `/`                                            | multipart upload, field `file` (§7)         |
| GET    | `/:id/download`                                | `Content-Disposition: attachment`           |
| GET    | `/:id/tags`, `/:id/posts`                      |                                             |
| GET    | `/:id/related`                                 | **outbound** edges (`from_file = :id`)      |
| GET    | `/:id/referenced`                              | **inbound** edges (`to_file = :id`)         |
| POST   | `/:id/tags` · DELETE `/:id/tags/:tagId`        |                                             |
| POST   | `/:id/posts` · DELETE `/:id/posts/:postId`     |                                             |
| POST   | `/:id/related` · DELETE `/:id/related/:fileId` |                                             |

**Lookup** — `/lookup`

| Method | Path                            | Purpose             |
| ------ | ------------------------------- | ------------------- |
| GET    | `/:entity?q=&exclude=&limit=10` | autocomplete source |

`:entity` ∈ `categories｜tags｜types｜posts｜files`. Responds
`{ success: true, data: [ { id, name, slug } ] }` — the minimum a picker needs.
`q` shorter than 1 character returns an empty list. `exclude` drops one id (used so a
category cannot be its own parent).

---

## 7. File upload

### 7.1 State machine

```
POST /files  (multipart)
      │
      ├─ multer diskStorage → storage/temp/<random>          ← size + mimetype enforced here
      │      reject → 413 (too large) / 415 (bad mimetype) / 400
      │
      ├─ sha256(tempPath) streaming
      │
      ├─ hash already in `files`?
      │     ├─ yes → unlink temp
      │     │        apply requested category / tags / post links to the EXISTING row
      │     │        200 { success: true, deduplicated: true, data: existing }
      │     │        web: flash warning "Already uploaded — linked the existing file"
      │     └─ no  → rename into storage/files/YYYY/MM/<uuid><ext>
      │              insert row
      │              201 { success: true, deduplicated: false, data: row }
```

### 7.2 Rules

- Blobs are named by a UUID; the user-supplied name is metadata only, so a hostile or
  colliding name can never affect the filesystem.
- `path` is stored relative to `FILES_DIR` and served from the `/storage` static mount.
- A photo chosen for a category, tag or post is uploaded through this same pipeline, so
  every photo is also a tracked, searchable `files` row. The `photo` column stores its
  `path`.
- `storage/temp` is emptied on boot; orphaned temp files are never served.
- Links supplied with a deduplicated upload are applied to the existing row — the user's
  intent is never discarded.

---

## 8. Web dashboard (`/v1/web`)

### 8.1 Shell

- Left sidebar (WordPress-style), collapsible, state persisted in `localStorage`.
- Topbar: global search, theme toggle.
- **Dark is the default.** `:root` carries the dark tokens; light tokens live under
  `[data-theme="light"]`.
- Fully responsive: sidebar becomes an off-canvas drawer below 900px; data tables
  collapse to stacked cards below 640px.
- Inline SVG icons via the `icon` helper — no icon font, no image requests.

### 8.2 Theme

`DEFAULT_THEME` seeds the `theme` cookie (1 year, `httpOnly: false`, readable by JS).
Toggling writes the cookie and flips `data-theme` on `<html>` optimistically; no page
reload. Server-rendered pages read the cookie so the first paint is already correct.

### 8.3 Per-entity pages

| Entity     | Index         | Form                                      | Detail            |
| ---------- | ------------- | ----------------------------------------- | ----------------- |
| categories | `/categories` | `/categories/new`, `/categories/:id/edit` | `/categories/:id` |
| tags       | `/tags`       | `/tags/new`, `/tags/:id/edit`             | `/tags/:id`       |
| types      | `/types`      | `/types/new`, `/types/:id/edit`           | `/types/:id`      |
| posts      | `/posts`      | `/posts/new`, `/posts/:id/edit`           | `/posts/:id`      |
| files      | `/files`      | upload form on `/files`                   | `/files/:id`      |
| dashboard  | `/`           | —                                         | —                 |

Index pages provide search (`q`), a sort control, entity-specific filters, and
pagination with the current query preserved. Rows link to their detail page.

`method-override` is mounted so forms may declare `_method=PUT` and `_method=DELETE`;
the delete control additionally passes through a confirmation dialog.

### 8.4 Detail pages (tabbed hubs)

| Page         | Tabs                                                         |
| ------------ | ------------------------------------------------------------ |
| **Category** | Posts · Files                                                |
| **Tag**      | Posts · Files                                                |
| **Type**     | Posts                                                        |
| **Post**     | Related posts · Files · Posts pointing here · Tags           |
| **File**     | Preview · Related files · Posts · Files pointing here · Tags |

Link rules — every reference is a link, nothing is a bare id:

- A post title links to `/web/posts/:id`.
- A file name links to `/web/files/:id`.
- A tag name links to `/web/tags/:id`.
- A category name links to `/web/categories/:id`.
- "Related" is the outbound edge list; "pointing here" is the inbound edge list. The two
  are always distinct and are never merged.

Tabs are anchor-linked (`#related`, `#files`, …) and remember the active tab in the URL
hash, so a tab survives a reload.

### 8.5 Relation pickers — the core interaction

> A user must never see, remember, or type an id.

Each foreign-key field renders as a text input plus a hidden id field:

1. The user types. After **3 characters** a debounced (250 ms) `GET /v1/json/lookup/:entity?q=…`
   opens a dropdown of `{ id, name, slug }`.
2. Arrow keys move, Enter selects, Escape closes. Selecting writes the id into the
   hidden field and the name into the visible one.
3. The field is `required`-free: leaving it empty means "no relation".
4. **Progressive enhancement** — with JavaScript disabled the visible field still
   submits the typed _name_, and `utils/refs.js` resolves it to an id server-side,
   returning `422` with a field error when no such name exists.

Pickers are used for: post → category, type, tags, files, related posts; file → category,
tags, related files; category → mother category; and every filter dropdown.

### 8.6 Flash and errors

Cookie-backed flash messages (`success｜info｜warning｜error`) survive exactly one
redirect and render as a toast stack. A failed submission re-renders the form with the
submitted values and per-field error messages.

---

## 9. Handlebars helpers

Exposed through `helpers/index.js`. Flat, JSDoc'd, no side effects.

| Group      | Helpers                                                                              |
| ---------- | ------------------------------------------------------------------------------------ |
| logic      | `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `and`, `or`, `not`, `includes`, `defaultValue` |
| dates      | `formatDate`, `formatDateTime`, `timeAgo`                                            |
| strings    | `truncate`, `slugify`, `initials`                                                    |
| numbers    | `formatNumber`, `formatFileSize`                                                     |
| arrays     | `length`, `first`, `last`, `join`, `json`, `pluck`                                   |
| iteration  | `times`                                                                              |
| forms      | `selected`, `checked`, `old`, `fieldError`, `hasError`                               |
| urls       | `url`, `query`, `isActive`, `asset`, `paginationUrl`, `sortUrl`                      |
| theme      | `themeAttribute`, `themeIcon`, `themeLabel`                                          |
| pagination | `pageRange`, `pagination`                                                            |
| ui         | `icon`, `badge`, `booleanLabel`, `statusBadge`, `spinner`, `mimetypeIcon`            |

Auth, CSRF and audit helpers are **removed**.

---

## 10. Content rendering

`utils/renderers.js` exports `renderContent(content, typeSlug)`:

- When `typeSlug` is listed in `MARKDOWN_TYPES` → `marked.parse(content)`.
- Otherwise → HTML-escaped text wrapped in `<pre class="prose-plain">`.
- `null` / `undefined` / empty content → empty string.

`notes` is **never** rendered — it is private working text shown verbatim in an escaped
`<pre>`. The `article` and `note` types seeded by `db/seeds/001_bootstrap.js` exercise
both branches.

---

## 11. Errors and logging

`middleware/errors.js` provides `AppError` plus `BadRequestError`, `NotFoundError`,
`ConflictError`, `ValidationError` (with `ValidationError.fromZod`), and
`InternalServerError`. The hierarchy is closed to exactly these cases.

`errorHandler` renders the JSON envelope under `/v1/json`, and an error view elsewhere.
Non-operational errors are logged in full and reported as a bare
`INTERNAL_SERVER_ERROR` — internals never reach the browser.

Logging is `pino` via `pino-http`, one JSON line per request, with `x-request-id`
echoed. `LOG_FORMAT=pretty` routes through `pino-pretty`; if that transport cannot be
loaded the logger silently falls back to JSON rather than crashing.

---

## 12. Testing

`vitest` + `supertest`, `vitest.config.js` pinned to a throwaway `DATABASE_URL`
(`./db.test.sqlite`) migrated once in `globalSetup`.

| Suite                | Coverage                                                         |
| -------------------- | ---------------------------------------------------------------- |
| `slug`               | `slugify`, `uniqueSlug` suffixing                                |
| `refs`               | id resolution, name resolution, unknown → validation error       |
| `renderers`          | markdown vs plain, escaping, empty input                         |
| `query`              | `parseSort` whitelist, `buildMeta`, `extractFilters`             |
| `categories` service | create/update, cycle rejection, RESTRICT delete guard            |
| `files` service      | upload dedup hit and miss, link reuse, mimetype rejection        |
| `posts` service      | slug de-duplication, status validation, directed edges           |
| HTTP smoke           | every `/v1/json` route, `/v1/web` renders, 404/422/409 envelopes |

`npm test` must pass with zero console errors.

---

## 13. Acceptance criteria

1. `npm install && npm run migrate && npm run seed && npm start` boots cleanly; `GET /`
   redirects to the dashboard; no error appears in the log.
2. Dark theme renders by default on a fresh profile with no cookie.
3. Every entity can be created, listed, searched, filtered, sorted, paginated, viewed,
   edited and deleted from the dashboard.
4. Detail pages show the tabs in §8.4 with correct links in both directions.
5. No interface anywhere displays a raw foreign-key id to the user.
6. A relation can be created from every picker, with and without JavaScript.
7. Uploading a byte-identical file twice produces two different ids only if the user
   explicitly asks for it; by default the second upload links the existing record and
   warns.
8. `GET /storage/files/...` serves an uploaded blob; `/:id/download` forces an
   attachment with the original filename.
9. Deleting a category with children, posts or files returns `409` and names the
   blockers.
10. Assigning a category as its own descendant is rejected both by the service and by
    the database trigger.
11. Every function in the source tree carries JSDoc.
12. `npm test` exits 0.

---

## 14. Non-goals (restated)

No login, accounts, roles or permissions. No password hashing. No CSRF tokens. No rate
limiting. No HTTPS termination. No email. No backups scheduler. No multi-user
concurrency control. No i18n framework. No component build step.

---

## Appendix A — Environment variables

```ini
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

DATABASE_URL=./db.sqlite

FILES_DIR=./storage
UPLOAD_MAX_MB=10
FILE_ALLOWED_MIME=image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

PAGE_SIZE=10
DEFAULT_THEME=dark
MARKDOWN_TYPES=article

LOG_LEVEL=info
LOG_FORMAT=pretty
```

## Appendix B — npm scripts

| Script       | Command                                                              |
| ------------ | -------------------------------------------------------------------- |
| `dev`        | `node --watch ./bin/www`                                             |
| `start`      | `node ./bin/www`                                                     |
| `migrate`    | `knex migrate:latest`                                                |
| `rollback`   | `knex migrate:rollback`                                              |
| `seed`       | `knex db:seed`                                                       |
| `fresh`      | `knex migrate:rollback --all && knex migrate:latest && knex db:seed` |
| `test`       | `vitest run`                                                         |
| `test:watch` | `vitest`                                                             |
