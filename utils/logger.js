/**
 * @file Structured logger and HTTP request-logging middleware.
 *
 * `pino` emits JSON by default. `LOG_FORMAT=pretty` pipes the stream through
 * `pino-pretty` for human-readable development output; if that optional dev
 * dependency is not installed the logger degrades to JSON instead of failing
 * to boot.
 *
 * There is no secret material in this application — no credentials, no tokens,
 * no sessions — so no redaction list is configured. Request bodies are never
 * logged.
 *
 * @module utils/logger
 */

import { randomUUID } from "node:crypto";
import pino from "pino";
import pinoHttp from "pino-http";

import { config } from "../config/index.js";

/**
 * Build the pretty-print transport when it is available.
 *
 * A worker thread is only spun up for the pretty format. When `pino-pretty`
 * cannot be resolved we return `undefined`, which makes pino write plain JSON
 * to stdout. That keeps `LOG_FORMAT=pretty` from turning a missing dev
 * dependency into a fatal boot error.
 *
 * @returns {import('pino').TransportMultiOptions | undefined}
 */
function buildTransport() {
	if (config.log.format !== "pretty") return undefined;
	if (config.isProd) return undefined;
	try {
		return {
			target: "pino-pretty",
			options: {
				colorize: true,
				translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
				ignore: "pid,hostname,env",
				singleLine: false,
			},
		};
	} catch {
		return undefined;
	}
}

/**
 * Base application logger.
 *
 * Usage:
 *   logger.info({ port }, "server listening");
 *   logger.error({ err }, "something failed");
 *
 * @type {import('pino').Logger}
 */
export const logger = pino({
	level: config.log.level,
	base: { env: config.env },
	transport: buildTransport(),
	timestamp: pino.stdTimeFunctions.isoTime,
	serializers: {
		err: pino.stdSerializers.err,
		error: pino.stdSerializers.err,
	},
});

/**
 * Options passed to `pino-http`.
 *
 * @returns {import('pino-http').Options}
 */
function httpOptions() {
	return {
		logger,
		// Generate our own request id so it can be echoed back to the client and
		// reused by any handler that runs after this middleware.
		genReqId: (req, res) => {
			const incoming = req.headers["x-request-id"];
			const id =
				typeof incoming === "string" && incoming
					? incoming
					: randomUUID();
			res.setHeader("x-request-id", id);
			return id;
		},
		customLogLevel: (_req, res, err) => {
			if (err || res.statusCode >= 500) return "error";
			if (res.statusCode >= 400) return "warn";
			return "info";
		},
		customSuccessMessage: (req, res) =>
			`${req.method} ${req.url} ${res.statusCode}`,
		customErrorMessage: (req, res) =>
			`${req.method} ${req.url} ${res.statusCode} — request failed`,
		// Static assets would drown the useful lines.
		autoLogging: {
			ignore: (req) =>
				req.url.startsWith(config.files.publicPath) ||
				req.url.startsWith("/stylesheets") ||
				req.url.startsWith("/javascripts") ||
				req.url === "/favicon.ico",
		},
		serializers: {
			req(req) {
				// The body is deliberately omitted: it holds post content.
				return {
					id: req.id,
					method: req.method,
					url: req.url,
				};
			},
			res(res) {
				return { statusCode: res.statusCode };
			},
		},
	};
}

/**
 * Express middleware that logs every request/response and attaches `req.log`,
 * a child logger bound to the request id.
 *
 * @type {import('express').RequestHandler}
 */
export const httpLogger = pinoHttp(httpOptions());

export default logger;