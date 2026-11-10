/**
 * @file `/v1/web` router — the Handlebars dashboard.
 *
 * Both front doors share one service layer, so this file is concerned purely
 * with view concerns: which layout to use, what the template context holds, and
 * which URLs the browser is allowed to reach by typing (themes, then forms).
 *
 * @module routes/web
 */

import { Router } from "express";

import { flashMiddleware } from "../middleware/flash.js";
import {
	dashboardContext,
	setThemeCookie,
} from "../middleware/dashboardContext.js";

import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";
import categoryWebRoutes from "../modules/categories/category.web.routes.js";
import tagWebRoutes from "../modules/tags/tag.web.routes.js";
import typeWebRoutes from "../modules/types/type.web.routes.js";
import postWebRoutes from "../modules/posts/post.web.routes.js";
import fileWebRoutes from "../modules/files/file.web.routes.js";

const router = Router();

// Populated before every render, by every route.
router.use(dashboardContext());
router.use(flashMiddleware());

/**
 * Persist a theme choice and return to wherever the user came from.
 */
router.post("/theme", (req, res) => {
	const requested = String(req.body?.theme ?? "").toLowerCase();
	const theme = requested === "light" || requested === "dark" ? requested : "dark";
	setThemeCookie(theme, res);

	const back = String(req.body?.redirect ?? "").toString();
	const safeBack = back.startsWith("/v1/web") ? back : "/v1/web";
	res.redirect(safeBack);
});

router.use("/", dashboardRoutes);
router.use("/categories", categoryWebRoutes);
router.use("/tags", tagWebRoutes);
router.use("/types", typeWebRoutes);
router.use("/posts", postWebRoutes);
router.use("/files", fileWebRoutes);

export default router;