/**
 * @file `/v1` router — the single entry point to both front doors.
 * @module routes/index
 */

import { Router } from "express";

import jsonRouter from "./json.routes.js";
import webRouter from "./web.routes.js";

const router = Router();

// Machine interface, for a separate front-end or scripting.
router.use("/json", jsonRouter);

// Human interface: Handlebars views and HTML forms.
router.use("/web", webRouter);

export default router;