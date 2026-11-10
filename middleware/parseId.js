/**
 * @file Route parameter validator — coerces `:id` to a positive integer.
 * @module middleware/parseId
 */

import { ValidationError } from "./errors.js";

/**
 * Validate `req.params[paramName]` as a positive integer and overwrite the
 * param with the numeric value, so downstream code never re-parses a string.
 *
 * @param {string} [paramName='id']
 * @returns {import('express').RequestHandler}
 */
export function parseId(paramName = "id") {
	return (req, _res, next) => {
		const raw = req.params[paramName];
		const id = Number(raw);
		if (!Number.isInteger(id) || id <= 0) {
			return next(
				new ValidationError(`Invalid ${paramName}: ${JSON.stringify(raw)}`, [
					{ field: paramName, message: "Must be a positive whole number" },
				]),
			);
		}
		req.params[paramName] = id;
		next();
	};
}