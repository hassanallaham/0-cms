/**
 * @file Theme helpers (dark / light).
 *
 * The active theme is a cookie, not a user record — there are no accounts here.
 * `middleware/dashboardContext.js` resolves the cookie (or `DEFAULT_THEME`) and
 * puts the result on the template root as `theme`.
 *
 * @module helpers/theme
 */

import { safe } from "./_utils.js";
import { ICONS } from "./icons.js";

/**
 * Read the resolved theme from the template root.
 *
 * @param {Handlebars.HelperOptions} options
 * @returns {'dark'|'light'}
 */
function resolveTheme(options) {
	return options?.data?.root?.theme === "light" ? "light" : "dark";
}

/**
 * Output `data-theme="dark"` or `data-theme="light"` for the `<html>` tag.
 *
 * @param {Handlebars.HelperOptions} options
 * @returns {Handlebars.SafeString}
 */
export function themeAttribute(options) {
	return safe(`data-theme="${resolveTheme(options)}"`);
}

/**
 * Output the SVG icon for the action the toggle performs: a sun while dark is
 * active, a moon while light is active.
 *
 * @param {Handlebars.HelperOptions} options
 * @returns {Handlebars.SafeString}
 */
export function themeIcon(options) {
	return safe(resolveTheme(options) === "dark" ? ICONS.sun : ICONS.moon);
}

/**
 * Accessible label for the theme toggle button.
 *
 * @param {Handlebars.HelperOptions} options
 * @returns {string}
 */
export function themeLabel(options) {
	return resolveTheme(options) === "dark"
		? "Switch to light theme"
		: "Switch to dark theme";
}

/**
 * Opposite theme — used by the client to flip without a round-trip.
 *
 * @param {Handlebars.HelperOptions} options
 * @returns {'dark'|'light'}
 */
export function oppositeTheme(options) {
	return resolveTheme(options) === "dark" ? "light" : "dark";
}