/**
 * @file Multipart upload handling.
 *
 * Uploads are written straight to `FILES_DIR/temp` by multer's disk storage —
 * never into memory — and validated afterwards by `modules/files/file.service.js`,
 * because the declared MIME type cannot be trusted before the bytes are hashed.
 *
 * @module middleware/upload
 */

import multer from "multer";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { config } from "../config/index.js";
import {
	AppError,
	PayloadTooLargeError,
	ValidationError,
} from "./errors.js";

/**
 * Destination directory for in-flight uploads.
 *
 * `config.files.tempDir` is outside the static mount, so a request that fails
 * validation can never leave a readable file behind.
 */
const DESTINATION = config.files.tempDir;

/**
 * Give every upload a UUID filename in the temp directory.
 *
 * The client's filename is deliberately discarded: it is attacker-controlled, and
 * it is only used later as display metadata.
 */
const diskStorage = multer.diskStorage({
	destination(_req, _file, done) {
		done(null, DESTINATION);
	},
	filename(_req, _file, done) {
		done(null, `${randomUUID()}.part`);
	},
});

/**
 * Multer instance for the upload endpoints.
 *
 * `limits.files` permits a small batch from the JSON API; `fileSize` is a cheap
 * first line of defence, and the service re-checks the real limit after hashing.
 */
export const upload = multer({
	storage: diskStorage,
	limits: {
		fileSize: config.files.maxBytes,
		files: 10,
		fields: 20,
	},
});

/**
 * Accept a single blob from the `file` field, or several from `files`.
 *
 * Both spellings are supported so the same middleware serves the HTML form (which
 * posts one field) and the JSON API (which may post a batch).
 *
 * `required: false` parses an upload only if one is present. That is what the post
 * and category forms use, where the file input is optional — requiring one there
 * would reject a perfectly valid text-only submission.
 *
 * @param {{ required?: boolean }} [options]
 * @returns {import('express').RequestHandler}
 */
export function acceptUpload({ required = true } = {}) {
	return (req, res, next) => {
		upload.any()(req, res, (err) => {
			if (err) {
				next(translateMulterError(err));
				return;
			}

			const files = normaliseUploads(req);
			if (files.length === 0 && required) {
				next(
					new ValidationError("No file was received", [
						{ field: "file", message: "Choose a file to upload" },
					]),
				);
				return;
			}

			// Express 5 makes `req.files` a getter, so the normalised list is stashed
			// under a name the routes can rely on.
			req.uploads = files;
			next();
		});
	};
}

/**
 * Flatten whatever multer produced into one array of file objects.
 *
 * @param {import('express').Request & { files?: unknown, file?: unknown }} req
 * @returns {Array<{ fieldname: string, originalname: string, mimetype: string, size: number, path: string }>}
 */
export function normaliseUploads(req) {
	const collected = req.file ? [req.file] : Array.isArray(req.files) ? req.files : [];
	return collected.filter(Boolean).map((file) => ({
		fieldname: file.fieldname,
		originalname: file.originalname,
		mimetype: file.mimetype,
		size: file.size,
		path: file.path,
	}));
}

/**
 * Translate a multer failure into our error hierarchy.
 *
 * @param {Error & { code?: string, field?: string }} err
 * @returns {AppError}
 */
export function translateMulterError(err) {
	if (err?.code === "LIMIT_FILE_SIZE") {
		return new PayloadTooLargeError(
			`Each file must be under ${config.files.maxMb} MB`,
			{ cause: err },
		);
	}
	if (err?.code === "LIMIT_FILE_COUNT" || err?.code === "LIMIT_FIELD_COUNT") {
		return new ValidationError("Too many files in one upload", [
			{ field: "file", message: "Upload at most 10 files at a time" },
		], { cause: err });
	}

	return new AppError("The upload could not be processed", {
		statusCode: 400,
		code: "UPLOAD_FAILED",
		cause: err,
	});
}

/**
 * Absolute temp directory uploads land in. Exposed for diagnostics.
 */
export const TEMP_DIR = join(DESTINATION);
