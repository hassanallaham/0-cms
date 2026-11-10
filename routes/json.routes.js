/**
 * @file `/v1/json` router — the JSON API.
 *
 * Every entity module contributes one router here. Nothing in this file contains
 * logic: it only decides which module owns which URL prefix.
 *
 * @module routes/json
 */

import { Router } from "express";

import lookupRoutes from "../modules/lookup/lookup.routes.js";
import categoryRoutes from "../modules/categories/category.routes.js";
import tagRoutes from "../modules/tags/tag.routes.js";
import typeRoutes from "../modules/types/type.routes.js";
import postRoutes from "../modules/posts/post.routes.js";
import fileRoutes from "../modules/files/file.routes.js";

const router = Router();

/**
 * Liveness probe. Cheap, unauthenticated, never logged.
 */
router.get("/health", (_req, res) => {
	res.json({ success: true, data: { status: "ok" } });
});

router.use("/lookup", lookupRoutes);
router.use("/categories", categoryRoutes);
router.use("/tags", tagRoutes);
router.use("/types", typeRoutes);
router.use("/posts", postRoutes);
router.use("/files", fileRoutes);

export default router;