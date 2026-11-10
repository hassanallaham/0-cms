/**
 * @file Environment configuration loader with schema validation.
 *
 * Loads variables from `.env`, validates them against a zod schema, and exports
 * a deeply frozen `config` object. Every derived value — absolute paths,
 * byte budgets, split CSV lists — is pre-computed exactly once, so consumers
 * never repeat that work and never disagree about it.
 *
 * The process exits with a readable report rather than booting in a partially
 * configured state.
 *
 * @module config
 */

import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, resolve } from "node:path";

import { config as loadDotenv } from "dotenv";
import { z } from "zod";

import { csvToArray } from "../utils/helpers.js";

loadDotenv({ quiet: true });

const here = dirname(fileURLToPath(import.meta.url));

/** Project root — every relative path in `.env` is resolved against it. */
export const ROOT_DIR = resolve(here, "..");

/**
 * Resolve a path from `.env` against the project root, so the app behaves
 * identically no matter which directory it was launched from.
 *
 * @param {string} value
 * @returns {string}
 */
function resolveFromRoot(value) {
	return isAbsolute(value) ? value : resolve(ROOT_DIR, value);
}

/**
 * Raw environment schema. Keys map 1:1 to `.env` variable names.
 */
const envSchema = z.object({
	// ─── Runtime ───────────────────────────────────────────────────────────────
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),
	PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
	APP_URL: z.url().default("http://localhost:3000"),

	// ─── Database ──────────────────────────────────────────────────────────────
	DATABASE_URL: z.string().min(1).default("./db.sqlite"),

	// ─── Uploads ───────────────────────────────────────────────────────────────
	FILES_DIR: z.string().min(1).default("./storage"),
	UPLOAD_MAX_MB: z.coerce.number().int().positive().max(500).default(10),
	FILE_ALLOWED_MIME: z.string().min(1),

	// ─── Interface ─────────────────────────────────────────────────────────────
	PAGE_SIZE: z.coerce.number().int().positive().max(100).default(10),
	DEFAULT_THEME: z.enum(["dark", "light"]).default("dark"),
	MARKDOWN_TYPES: z.string().default("article"),

	// ─── Logging ───────────────────────────────────────────────────────────────
	LOG_LEVEL: z
		.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
		.default("info"),
	LOG_FORMAT: z.enum(["json", "pretty"]).default("pretty"),
});

/**
 * Parse `process.env`. On failure, print a readable summary and exit.
 *
 * @returns {z.infer<typeof envSchema>}
 */
function parseEnv() {
	const parsed = envSchema.safeParse(process.env);

	if (!parsed.success) {
		const lines = parsed.error.issues.map(
			(issue) => `  • ${issue.path.join(".") || "(root)"}: ${issue.message}`,
		);
		console.error(
			[
				"",
				"[config] Invalid environment configuration:",
				...lines,
				"",
				"See .env.example for the expected shape.",
				"",
			].join("\n"),
		);
		process.exit(1);
	}

	return parsed.data;
}

const raw = parseEnv();

/**
 * Structured, validated, frozen configuration.
 *
 * @typedef {object} AppConfig
 * @property {'development'|'test'|'production'} env
 * @property {boolean} isDev
 * @property {boolean} isTest
 * @property {boolean} isProd
 * @property {string} rootDir Absolute project root.
 * @property {{ port: number, url: string }} app
 * @property {{ client: 'better-sqlite3', url: string }} db
 * @property {{
 *   dir: string,
 *   filesDir: string,
 *   tempDir: string,
 *   publicPath: string,
 *   maxBytes: number,
 *   maxMb: number,
 *   allowedMime: readonly string[]
 * }} files
 * @property {{
 *   pageSize: number,
 *   defaultTheme: 'dark'|'light',
 *   themeCookie: string,
 *   markdownTypes: readonly string[]
 * }} ui
 * @property {{ level: string, format: 'json'|'pretty' }} log
 */

/** @type {Readonly<AppConfig>} */
export const config = Object.freeze({
	env: raw.NODE_ENV,
	isDev: raw.NODE_ENV === "development",
	isTest: raw.NODE_ENV === "test",
	isProd: raw.NODE_ENV === "production",

	rootDir: ROOT_DIR,

	app: Object.freeze({
		port: raw.PORT,
		url: raw.APP_URL.replace(/\/+$/, ""),
	}),

	db: Object.freeze({
		client: /** @type {const} */ ("better-sqlite3"),
		url: resolveFromRoot(raw.DATABASE_URL),
	}),

	files: Object.freeze({
		dir: resolveFromRoot(raw.FILES_DIR),
		// Blob root. `files/` is what /storage serves; `temp/` is private.
		filesDir: resolve(resolveFromRoot(raw.FILES_DIR), "files"),
		tempDir: resolve(resolveFromRoot(raw.FILES_DIR), "temp"),
		// URL prefix the blob root is mounted at.
		publicPath: "/storage",
		maxBytes: raw.UPLOAD_MAX_MB * 1024 * 1024,
		maxMb: raw.UPLOAD_MAX_MB,
		allowedMime: Object.freeze(csvToArray(raw.FILE_ALLOWED_MIME)),
	}),

	ui: Object.freeze({
		pageSize: raw.PAGE_SIZE,
		defaultTheme: raw.DEFAULT_THEME,
		themeCookie: "theme",
		markdownTypes: Object.freeze(csvToArray(raw.MARKDOWN_TYPES)),
	}),

	log: Object.freeze({
		level: raw.LOG_LEVEL,
		format: raw.LOG_FORMAT,
	}),
});

export default config;