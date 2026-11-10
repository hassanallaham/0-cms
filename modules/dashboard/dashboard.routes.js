/**
 * @file `/v1/web` dashboard routes.
 * @module modules/dashboard/dashboard.routes
 */

import { Router } from "express";

import * as service from "./dashboard.service.js";

const router = Router();

/**
 * The dashboard landing page.
 */
router.get("/", async (req, res) => {
	const overview = await service.overview({ limit: req.query.limit });

	res.render("dashboard/index", {
		title: "Dashboard",
		activeNav: "dashboard",
		...overview,
	});
});

export default router;
