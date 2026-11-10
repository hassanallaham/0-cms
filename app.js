/**
 * @file Express application assembly.
 *
 * Responsibilities, in order: request logging, body and cookie parsing, static
 * assets, the versioned router, then the terminal 404 and error handlers.
 *
 * @module app
 */

import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";

import express from "express";
import cookieParser from "cookie-parser";
import methodOverride from "method-override";
import { create } from "express-handlebars";
import Handlebars from "handlebars";
import { allowInsecurePrototypeAccess } from "@handlebars/allow-prototype-access";

import { config } from "./config/index.js";
import * as helpers from "./helpers/index.js";
import { httpLogger } from "./utils/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import router from "./routes/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const hbs = create({
	extname: ".hbs",
	encoding: "utf8",
	layoutsDir: join(__dirname, "views", "layouts"),
	partialsDir: [join(__dirname, "views", "partials")],
	defaultLayout: "main",
	helpers,
	handlebars: allowInsecurePrototypeAccess(Handlebars),
});

const app = express();

// Behind the view engine: every `res.render` goes through express-handlebars.
// `hbs.engine` is the Express-compatible `(path, options, callback)` renderer.
app.engine(".hbs", hbs.engine);
app.set("views", join(__dirname, "views"));
app.set("view engine", ".hbs");
app.disable("x-powered-by");
app.set("trust proxy", false);

// ── Request pipeline ────────────────────────────────────────────────────────
app.use(httpLogger);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// HTML forms can only speak GET and POST, so `_method=PUT|DELETE` is honoured
// (SRS §8.3). The getter is explicit because method-override's string form only
// reads the *query* string, whereas a form declares the method in a hidden body
// field; both places are checked, body first.
app.use(
	methodOverride((req) => {
		const fromBody =
			req.body && typeof req.body === "object"
				? req.body._method
				: undefined;
		return fromBody ?? req.query?._method;
	}),
);

// ── Static assets ───────────────────────────────────────────────────────────
// CSS/JS/favicon from public/. `maxAge` is long because filenames are stable.
app.use(
	express.static(join(__dirname, "public"), {
		maxAge: config.isProd ? "7d" : 0,
		etag: true,
	}),
);

// Uploaded blobs. `files.path` is stored relative to FILES_DIR (SRS §7.2), so
// FILES_DIR itself is the mount root and a blob reads at `/storage/files/…`.
// The temp staging area sits under the same root, so it is refused explicitly
// and before the static handler — an interrupted upload is never served.
app.use(
	`${config.files.publicPath}/${basename(config.files.tempDir)}`,
	(_req, res) => res.status(404).end(),
);
app.use(
	config.files.publicPath,
	express.static(config.files.dir, {
		index: false,
		dotfiles: "deny",
		maxAge: "30d",
		immutable: true,
		setHeaders: (res) => {
			// Stored under UUID names, so they can never be overwritten.
			res.setHeader("X-Content-Type-Options", "nosniff");
		},
	}),
);

// ── Application ─────────────────────────────────────────────────────────────
app.use("/v1", router);

// Root is not part of the API surface; send people to the dashboard.
app.get("/", (_req, res) => res.redirect("/v1/web"));

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
