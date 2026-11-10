/**
 * @file Application error classes.
 *
 * Every error the application raises on purpose extends `AppError`. That gives
 * the central error handler a uniform shape to work with, keeps HTTP concerns
 * out of the service layer, and guarantees that internal details never leak to
 * the browser.
 *
 * @module middleware/errors
 */

/**
 * Base class for all expected application errors.
 *
 * `isOperational` separates errors we raise deliberately (validation,
 * not-found, conflict) from programming errors. The handler exposes the message
 * of operational errors and reduces everything else to a generic 500.
 *
 * @extends Error
 */
export class AppError extends Error {
	/**
	 * @param {string} message - Human-readable description.
	 * @param {object} [options]
	 * @param {number} [options.statusCode=500] - HTTP status to return.
	 * @param {string} [options.code='APP_ERROR'] - Machine-readable code.
	 * @param {unknown} [options.details] - Extra structured data.
	 * @param {boolean} [options.isOperational=true] - Safe to show to the client?
	 * @param {Error} [options.cause] - Underlying error, preserved for logging.
	 */
	constructor(message, options = {}) {
		const {
			statusCode = 500,
			code = "APP_ERROR",
			details,
			isOperational = true,
			cause,
		} = options;

		super(message);
		this.name = this.constructor.name;
		this.statusCode = statusCode;
		this.code = code;
		this.details = details;
		this.isOperational = isOperational;
		if (cause) this.cause = cause;

		// Point the stack at the caller rather than this constructor.
		if (typeof Error.captureStackTrace === "function") {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/**
	 * Serialise for the JSON error envelope.
	 *
	 * @returns {{ code: string, message: string, details?: unknown }}
	 */
	toJSON() {
		/** @type {{ code: string, message: string, details?: unknown }} */
		const out = { code: this.code, message: this.message };
		if (this.details !== undefined) out.details = this.details;
		return out;
	}
}

/**
 * 400 — the request is malformed at the protocol level (bad JSON, oversized
 * body). Distinct from {@link ValidationError}, which is about well-formed input
 * that fails a business rule.
 *
 * @extends AppError
 */
export class BadRequestError extends AppError {
	/**
	 * @param {string} [message='Bad request']
	 * @param {object} [options]
	 */
	constructor(message = "Bad request", options = {}) {
		super(message, { statusCode: 400, code: "BAD_REQUEST", ...options });
	}
}

/**
 * 404 — the requested record or route does not exist.
 *
 * @extends AppError
 */
export class NotFoundError extends AppError {
	/**
	 * @param {string} [message='Not found']
	 * @param {object} [options]
	 */
	constructor(message = "Not found", options = {}) {
		super(message, { statusCode: 404, code: "NOT_FOUND", ...options });
	}
}

/**
 * 409 — the request conflicts with current state: a unique value is taken, or a
 * deletion would orphan something that must not be orphaned.
 *
 * @extends AppError
 */
export class ConflictError extends AppError {
	/**
	 * @param {string} [message='Conflict']
	 * @param {object} [options]
	 */
	constructor(message = "Conflict", options = {}) {
		super(message, { statusCode: 409, code: "CONFLICT", ...options });
	}
}

/**
 * 413 — the upload exceeds `UPLOAD_MAX_MB`.
 *
 * @extends AppError
 */
export class PayloadTooLargeError extends AppError {
	/**
	 * @param {string} [message='File is too large']
	 * @param {object} [options]
	 */
	constructor(message = "File is too large", options = {}) {
		super(message, { statusCode: 413, code: "PAYLOAD_TOO_LARGE", ...options });
	}
}

/**
 * 415 — the upload's mimetype is not in `FILE_ALLOWED_MIME`.
 *
 * @extends AppError
 */
export class UnsupportedMediaTypeError extends AppError {
	/**
	 * @param {string} [message='Unsupported file type']
	 * @param {object} [options]
	 */
	constructor(message = "Unsupported file type", options = {}) {
		super(message, { statusCode: 415, code: "UNSUPPORTED_MEDIA_TYPE", ...options });
	}
}

/**
 * 422 — the input is well-formed but fails validation. `errors` is an array of
 * `{ field, message }` so the dashboard can render messages beside the matching
 * input and the JSON API can return field-level detail.
 *
 * @extends AppError
 */
export class ValidationError extends AppError {
	/**
	 * @param {string} [message='Validation failed']
	 * @param {Array<{ field: string, message: string }>} [errors=[]]
	 * @param {object} [options]
	 */
	constructor(message = "Validation failed", errors = [], options = {}) {
		super(message, {
			statusCode: 422,
			code: "VALIDATION_ERROR",
			details: errors,
			...options,
		});
		/** @type {Array<{ field: string, message: string }>} */
		this.errors = errors;
	}

	/**
	 * Convert validation errors into the `{ field: message }` map the form
	 * helpers expect.
	 *
	 * @returns {Record<string, string>}
	 */
	toFieldMap() {
		/** @type {Record<string, string>} */
		const map = {};
		for (const entry of this.errors ?? []) {
			if (!entry?.field) continue;
			map[entry.field] = map[entry.field]
				? `${map[entry.field]} ${entry.message}`
				: entry.message;
		}
		return map;
	}

	/**
	 * Build a `ValidationError` from a zod `ZodError`.
	 *
	 * @param {import('zod').ZodError} zodError
	 * @returns {ValidationError}
	 */
	static fromZod(zodError) {
		const errors = zodError.issues.map((issue) => ({
			field: issue.path.join(".") || "(root)",
			message: issue.message,
		}));
		return new ValidationError("Validation failed", errors);
	}
}

/**
 * Map a `better-sqlite3` constraint failure onto a friendly `AppError`.
 *
 * Called at the repository boundary so services never see raw SQL strings, and
 * so an unexpected race produces a 409 instead of a 500.
 *
 * `better-sqlite3` is not fully consistent about which extended result code it
 * reports for a foreign-key rejection — depending on how the statement was
 * compiled it may surface as `SQLITE_CONSTRAINT_TRIGGER` — so the message is
 * consulted as well.
 *
 * @param {Error & { code?: string }} err
 * @param {string} [context] - Human label, e.g. `"post"`.
 * @returns {AppError}
 */
export function mapSqliteError(err, context = "record") {
	const sqliteCode = err?.code ?? "";
	const message = String(err?.message ?? "");

	if (sqliteCode.startsWith("SQLITE_CONSTRAINT_FOREIGNKEY") || /FOREIGN KEY constraint failed/i.test(message)) {
		return new ConflictError(
			`That ${context} is still referenced by something else`,
			{ cause: err },
		);
	}
	if (sqliteCode.startsWith("SQLITE_CONSTRAINT_CHECK") || /CHECK constraint failed/i.test(message)) {
		return new ValidationError(`That ${context} breaks a database rule`, [
			{ field: "(root)", message: message.replace(/^CHECK constraint failed:\s*/i, "").replace(/[a-z_]+_valid$/, "is not a valid value") },
		], { cause: err });
	}
	if (sqliteCode.startsWith("SQLITE_CONSTRAINT_UNIQUE") || sqliteCode === "SQLITE_CONSTRAINT_PRIMARYKEY" || /UNIQUE constraint failed/i.test(message)) {
		return new ConflictError(`That ${context} already exists`, { cause: err });
	}
	if (sqliteCode.startsWith("SQLITE_CONSTRAINT")) {
		return new ConflictError(`Constraint violation on ${context}`, { cause: err });
	}

	return new AppError(`Database error on ${context}`, {
		statusCode: 500,
		code: "DATABASE_ERROR",
		isOperational: false,
		cause: err,
	});
}