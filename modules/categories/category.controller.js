/**
 * @file HTTP layer for the categories module.
 * @module modules/categories/category.controller
 */

import * as service from "./category.service.js";
import {
	createCategorySchema,
	updateCategorySchema,
	listCategoriesQuerySchema,
	listRelatedQuerySchema,
} from "./category.schema.js";
import { ValidationError } from "../../middleware/errors.js";

/**
 * @param {import('zod').ZodTypeAny} schema
 * @param {unknown} input
 * @returns {any}
 */
function parse(schema, input) {
	const result = schema.safeParse(input);
	if (!result.success) throw ValidationError.fromZod(result.error);
	return result.data;
}

/** @type {import('express').RequestHandler} */
export async function list(req, res) {
	const query = parse(listCategoriesQuerySchema, req.query);
	const result = await service.list(query);
	res.json({ success: true, data: result.data, meta: result.meta });
}

/** @type {import('express').RequestHandler} */
export async function show(req, res) {
	const cat = await service.findById(Number(req.params.id));
	res.json({ success: true, data: cat });
}

/** @type {import('express').RequestHandler} */
export async function create(req, res) {
	const input = parse(createCategorySchema, req.body);
	const id = await service.create(input);
	const cat = await service.findById(id);
	res.status(201).json({ success: true, data: cat });
}

/** @type {import('express').RequestHandler} */
export async function update(req, res) {
	const input = parse(updateCategorySchema, req.body);
	const cat = await service.update(Number(req.params.id), input);
	res.json({ success: true, data: cat });
}

/** @type {import('express').RequestHandler} */
export async function remove(req, res) {
	await service.remove(Number(req.params.id));
	res.status(204).send();
}

/** @type {import('express').RequestHandler} */
export async function listChildren(req, res) {
	const query = parse(listRelatedQuerySchema, req.query);
	const result = await service.listChildren(Number(req.params.id), query);
	res.json({ success: true, data: result.data, meta: result.meta });
}

/** @type {import('express').RequestHandler} */
export async function listPosts(req, res) {
	const query = parse(listRelatedQuerySchema, req.query);
	const result = await service.listPosts(Number(req.params.id), query);
	res.json({ success: true, data: result.data, meta: result.meta });
}
