/**
 * @file Central error handler and 404 handler.
 *
 * Converts any thrown value into the JSON envelope for `/v1/json`, or an error
 * view for `/v1/web`. Unexpected errors are logged in full and reported as a
 * bare `INTERNAL_SERVER_ERROR`.
 *
 * @module middleware/errorHandler
 */

import { AppError, BadRequestError, NotFoundError } from "./errors.js";
import { config } from "../config/index.js";

/**
 * True when the request expects a JSON response.
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function wantsJson(req) {
	if (req.path.startsWith("/v1/json") || req.path.startsWith("/json")) return true;
	const accept = String(req.headers.accept ?? "");
	return accept.includes("application/json") && !accept.includes("text/html");
}

/**
 * Build the error payload returned to JSON clients.
 *
 * @param {unknown} err
 * @returns {{ statusCode: number, body: { code: string, message: string, details?: unknown } }}
 */
function buildErrorPayload(err) {
	if (err instanceof AppError && err.isOperational) {
		return { statusCode: err.statusCode, body: err.toJSON() };
	}
	return {
		statusCode: 500,
		body: { code: "INTERNAL_SERVER_ERROR", message: "Something went wrong" },
	};
}

/**
 * Express error-handling middleware. Mount last.
 *
 * @type {import('express').ErrorRequestHandler}
 */
export function errorHandler(err, req, res, next) {
	const log = req.log ?? console;

	// Normalise body-parser and multer failures into our hierarchy.
	if (err && !(err instanceof AppError)) {
		if (err.type === "entity.parse.failed") {
			err = new BadRequestError("Invalid JSON in request body", { cause: err });
		} else if (err.type === "entity.too.large") {
			err = new BadRequestError("Request body too large", { cause: err });
		}
	}

	const { statusCode, body } = buildErrorPayload(err);

	if (statusCode >= 500) {
		log.error({ err }, body.message);
	} else {
		log.warn({ code: body.code, statusCode }, body.message);
	}

	// A downstream handler may already have written part of the response.
	if (res.headersSent) {
		log.error({ err }, "headers already sent before errorHandler");
		return next(err);
	}

	if (wantsJson(req)) {
		res.status(statusCode).json({ success: false, error: body });
		return;
	}

	res.status(statusCode).render("error", {
		layout: "blank",
		title: `Error ${statusCode}`,
		statusCode,
		message: body.message,
		code: body.code,
		details: config.isDev ? body.details : undefined,
	});
}

/**
 * Catch-all 404 handler. Mount before `errorHandler`.
 *
 * @type {import('express').RequestHandler}
 */
export function notFoundHandler(req, _res, next) {
	next(new NotFoundError(`No route for ${req.method} ${req.originalUrl}`));
}