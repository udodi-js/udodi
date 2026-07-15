import { getComponent, removeComponent } from "./componentRegistry.js";
import { mount } from "./mount.js";
import { unmount } from "./unmount.js";
import { getVM } from "../core/vmInstance.js";
import { renderStyles } from "./styleScope.js";

/**
 * Resolves a target into a DOM element.
 *
 * @param {HTMLElement|string} target - A DOM element or a CSS selector string
 * @returns {HTMLElement|null} The resolved DOM element or null
 */
function resolveTarget(target) {
	if (typeof target === "string") {
		return document.querySelector(target);
	}
	return target;
}

/**
 * Extracts the component placeholder ID from a rendered component placeholder.
 *
 * @param {any} placeholder - Component placeholder (usually from createComponent())
 * @returns {number|null} The component ID or null if not found
 */
function getPlaceholderId(placeholder) {
	const html = String(placeholder).trim();
	if (!html) return null;

	const match = html.match(/id=["']?(\d+)["']?/i);
	if (!match) return null;

	const id = Number(match[1]);
	return Number.isInteger(id) ? id : null;
}

/**
 * Renders a Udodi component into a target container.
 *
 * This is the main public API for mounting components in Udodi.
 *
 * @param {any} placeholder - The component placeholder returned by calling a component created with `createComponent()`
 * @param {HTMLElement|string} target - The target DOM element or CSS selector where the component should be mounted
 * @returns {Object} The mounted component instance with `unmount()` method and other properties
 *
 * @throws {Error} If target is invalid or component placeholder is malformed
 *
 * @example
 * // Basic usage
 * render(MyComponent({ name: "Alice" }), "#app");
 *
 * // Using CSS selector
 * render(Dashboard(), document.getElementById("root"));
 */
export function render(placeholder, target) {
	const container = resolveTarget(target);

	if (!container) {
		throw new Error("[render] Target element is required");
	}

	const placeholderId = getPlaceholderId(placeholder);
	if (placeholderId === null) {
		throw new Error("[render] Expected a component placeholder from createComponent()");
	}

	const entry = getComponent(placeholderId);
	if (!entry) {
		throw new Error(`[render] Component "${placeholderId}" not found`);
	}

	// Clean up any existing component in the container
	unmount(container);

	// Get internal VM (library-managed)
	const vm = getVM();

	// Mount the component using the internal mount function
	const instance = mount(
		entry.Component(entry.props),
		container,
		vm // Pass down to mount
	);

	// Remove from registry after successful mount
	removeComponent(placeholderId);

	// Renders all registered scoped CSS
	renderStyles();

	// Return the mounted instance (it include unmount method, context, etc.)
	return instance;
}
