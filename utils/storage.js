/**
 * @file Blob storage: hashing, placement, atomic moves and cleanup.
 *
 * Uploads arrive in `FILES_DIR/temp`, are hashed, and are then either discarded
 * (duplicate) or moved to `FILES_DIR/files/YYYY/MM/<uuid>.<ext>` and recorded.
 * Blobs are always named by a UUID, so a hostile or colliding original filename
 * never reaches the filesystem.
 *
 * @module utils/storage
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, readdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, extname, join, resolve, sep } from "node:path";

import { config } from "../config/index.js";
import { ValidationError } from "../middleware/errors.js";

/** Hash algorithm for the content-addressed store. */
const HASH_ALGORITHM = "sha256";

/**
 * Compute the sha256 hex digest of a file without loading it into memory.
 *
 * Streaming keeps memory flat regardless of `UPLOAD_MAX_MB`, which matters for a
 * tool whose whole selling point is low resource use.
 *
 * @param {string} filePath - Absolute or relative path to an existing file.
 * @returns {Promise<string>} Lowercase hex digest.
 */
export function hashFile(filePath) {
	return new Promise((resolvePromise, reject) => {
		const hash = createHash(HASH_ALGORITHM);
		const stream = createReadStream(filePath);
		stream.on("error", reject);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("end", () => resolvePromise(hash.digest("hex")));
	});
}

/**
 * Lowercase extension for a mimetype, e.g. `image/jpeg` → `.jpg`.
 *
 * Only extensions that map cleanly are used; anything unrecognised falls back to
 * the final mimetype sub-type, and a mimetype with no usable sub-type yields an
 * empty string.
 *
 * @param {string} mimetype
 * @returns {string} Extension including the leading dot, or `""`.
 */
export function extensionFor(mimetype) {
	const type = String(mimetype ?? "")
		.split(";")[0]
		.trim()
		.toLowerCase();
	if (!type) return "";

	/** @type {Record<string, string>} */
	const known = {
		"image/jpeg": ".jpg",
		"image/png": ".png",
		"image/gif": ".gif",
		"image/webp": ".webp",
		"image/svg+xml": ".svg",
		"image/avif": ".avif",
		"application/pdf": ".pdf",
		"text/plain": ".txt",
		"text/markdown": ".md",
		"text/csv": ".csv",
		"text/html": ".html",
		"application/msword": ".doc",
		"application/vnd.ms-excel": ".xls",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
			".docx",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
		"application/zip": ".zip",
		"application/json": ".json",
	};
	if (known[type]) return known[type];

	const sub = type.split("/")[1];
	if (!sub) return "";

	const cleaned = sub.replace(/^x-/, "").replace(/[^a-z0-9]/g, "");
	return cleaned ? `.${cleaned}` : "";
}

/**
 * Allocate a storage-relative path for a new blob, partitioned by month so no
 * single directory ever accumulates thousands of entries.
 *
 * @param {string} mimetype - Source mimetype, used to pick the extension.
 * @returns {{ storedName: string, path: string, absolutePath: string }}
 */
export function allocateBlobPath(mimetype) {
	const now = new Date();
	const year = String(now.getFullYear());
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const storedName = `${randomUUID()}${extensionFor(mimetype)}`;
	const relative = join("files", year, month, storedName);
	return {
		storedName,
		path: relative,
		absolutePath: resolve(config.files.dir, relative),
	};
}

/**
 * Ensure a directory exists.
 *
 * @param {string} dir
 * @returns {Promise<void>}
 */
export async function ensureDir(dir) {
	await mkdir(dir, { recursive: true });
}

/**
 * Create the blob root and the private temp directory.
 *
 * @returns {Promise<void>}
 */
export async function ensureStorageLayout() {
	await ensureDir(config.files.filesDir);
	await ensureDir(config.files.tempDir);
}

/**
 * Move a temp upload to its final location.
 *
 * `rename` is atomic when both paths live on the same filesystem, which they do
 * by construction. If the destination directory was somehow removed the move
 * fails and the caller sees the error.
 *
 * @param {string} fromPath - Absolute path of the temp file.
 * @param {string} toPath - Absolute destination path.
 * @returns {Promise<void>}
 */
export async function moveInto(fromPath, toPath) {
	await ensureDir(join(toPath, ".."));
	await rename(fromPath, toPath);
}

/**
 * Delete a temp file, ignoring the case where it is already gone.
 *
 * @param {string|null|undefined} filePath
 * @returns {Promise<void>}
 */
export async function discardTemp(filePath) {
	if (!filePath) return;
	await rm(filePath, { force: true });
}

/**
 * Delete a stored blob.
 *
 * @param {string|null|undefined} relativePath - Path as stored in `files.path`.
 * @returns {Promise<void>}
 */
export async function removeBlob(relativePath) {
	const absolute = absoluteBlobPath(relativePath);
	if (!absolute) return;
	await rm(absolute, { force: true });
}

/**
 * Resolve a stored blob to an absolute path, refusing anything that escapes
 * `FILES_DIR`.
 *
 * @param {string|null|undefined} relativePath
 * @returns {string|null} Absolute path, or `null` when unsafe or absent.
 */
export function absoluteBlobPath(relativePath) {
	if (!relativePath) return null;
	const root = resolve(config.files.dir);
	const candidate = resolve(root, relativePath);
	if (candidate !== root && !candidate.startsWith(root + sep)) return null;
	return candidate;
}

/**
 * Public URL of a stored blob.
 *
 * @param {string|null|undefined} relativePath - Path as stored in `files.path`.
 * @returns {string|null}
 */
export function blobUrl(relativePath) {
	if (!relativePath) return null;
	return `${config.files.publicPath}/${String(relativePath)
		.split(/[\\/]+/)
		.filter(Boolean)
		.join("/")}`;
}

/**
 * Turn an arbitrary client-supplied filename into a safe basename.
 *
 * Used for the `original_name` metadata field so display code never has to think
 * about path traversal. Only the final path segment survives, and separators and
 * control characters are dropped.
 *
 * @param {unknown} originalName
 * @returns {string} A non-empty basename, or `"file"` when nothing survives.
 */
export function safeOriginalName(originalName) {
	const text = String(originalName ?? "").trim();
	if (!text) return "file";
	const base = basename(text.split(/[\\/]+/).join("/"));
	// eslint-disable-next-line no-control-regex
	const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
	return cleaned || "file";
}

/**
 * Remove every leftover file in the temp directory.
 *
 * Called at boot: anything still there belongs to an upload that was interrupted,
 * and it must never be reachable over HTTP.
 *
 * @returns {Promise<number>} Number of files removed.
 */
export async function purgeTemp() {
	await ensureStorageLayout();
	let removed = 0;
	/** @type {string[]} */
	const entries = [];
	try {
		entries.push(...(await readdir(config.files.tempDir)));
	} catch {
		return 0;
	}
	for (const entry of entries) {
		if (entry === ".gitkeep") continue;
		const target = join(config.files.tempDir, entry);
		try {
			const info = await stat(target);
			if (!info.isFile()) continue;
			await rm(target, { force: true });
			removed += 1;
		} catch {
			// A file we cannot remove is not worth failing the boot over.
		}
	}
	return removed;
}

/**
 * Strip parameters and casing from a mimetype: `Text/Plain; charset=utf-8` →
 * `text/plain`.
 *
 * Browsers and `curl` both send decorated mimetypes, so the allow-list check has
 * to compare against the bare type.
 *
 * @param {unknown} mimetype
 * @returns {string} Normalised mimetype, or `""` when there is none.
 */
export function normaliseMimeType(mimetype) {
	return String(mimetype ?? "")
		.split(";")[0]
		.trim()
		.toLowerCase();
}

/**
 * True when a mimetype is on the configured allow-list.
 *
 * @param {unknown} mimetype
 * @returns {boolean}
 */
export function isAllowedMimeType(mimetype) {
	const type = normaliseMimeType(mimetype);
	if (!type) return false;
	return config.files.allowedMime.some((allowed) => normaliseMimeType(allowed) === type);
}

/**
 * Reject a mimetype that is not on the allow-list.
 *
 * Enforced at runtime rather than trusted from the browser: the declared type is
 * attacker-controlled, and blobs are served from the app's own origin.
 *
 * @param {unknown} mimetype
 * @param {string} [originalName] - Used only to make the error readable.
 * @throws {import('../middleware/errors.js').ValidationError}
 */
export function assertAllowedMimeType(mimetype, originalName = "that file") {
	const type = normaliseMimeType(mimetype);
	if (isAllowedMimeType(type)) return;

	const label = originalName ? `"${originalName}"` : "that file";
	throw new ValidationError(
		`${label} is a ${type || "missing"} file, which is not allowed here`,
		[
			{
				field: "file",
				message: `Allowed types: ${config.files.allowedMime.join(", ")}`,
			},
		],
	);
}

/**
 * Human-readable byte count, e.g. `1536` → `1.5 KB`.
 *
 * @param {unknown} bytes
 * @returns {string}
 */
export function formatSize(bytes) {
	const value = Number(bytes);
	if (!Number.isFinite(value) || value < 0) return "0 B";

	const units = ["B", "KB", "MB", "GB", "TB"];
	let size = value;
	let unit = 0;
	while (size >= 1024 && unit < units.length - 1) {
		size /= 1024;
		unit += 1;
	}
	const rounded = unit === 0 ? String(Math.round(size)) : size.toFixed(size < 10 ? 1 : 0);
	return `${rounded} ${units[unit]}`;
}

/**
 * Presentational label for a mimetype: `image/jpeg` → `JPEG`.
 *
 * @param {string|null|undefined} mimetype
 * @returns {string}
 */
export function mimetypeLabel(mimetype) {
	const sub = String(mimetype ?? "").split("/")[1]?.split(";")[0];
	if (!sub) return "File";
	return sub
		.replace(/^x-/, "")
		.replace(/[-_.]/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Extension of a filename, lowercased and including the dot, or `""`.
 *
 * @param {string|null|undefined} filename
 * @returns {string}
 */
export function extensionOf(filename) {
	return extname(String(filename ?? "")).toLowerCase();
}