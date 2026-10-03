/**
 * Component Registry
 *
 * Uses a plain JavaScript object for simplified component placeholder storage.
 * Handles dynamic insertions and cleanups without manual resizing logic.
 *
 * Structural placeholders (those originally living under `@if` / `@for` / `@elseif` / `@else`)
 * are intentionally retained in the registry for the lifetime of the page so that
 * cloned templates can reuse the same Component + props entries. Only non-structural
 * placeholders are removed after they have been resolved.
 */

let nextId = 0;
let registry = Object.create(null);

/**
 * Adds a new component to the registry and returns a placeholder HTML string.
 *
 * @param {Function} Component - The component factory function.
 * @param {Object} [props={}] - Props to pass to the component.
 * @returns {string} HTML placeholder with id attribute.
 */
export function addComponent(Component, props = {}) {
	const id = nextId++;

	// Plain objects allow direct key assignment without capacity limits.
	registry[id] = {
		Component,
		props,
	};

	return `<udodi-component id="${id}"></udodi-component>`;
}

/**
 * Retrieves a component entry by its ID.
 *
 * @param {number} id - The component ID.
 * @returns {Object|undefined} The component entry or undefined if not found.
 */
export function getComponent(id) {
	return registry[id];
}

/**
 * Removes a component from the registry (for cleanup).
 *
 * Only non-structural placeholders should be removed. Structural placeholders
 * are deliberately kept so that cloned templates can continue to resolve them.
 *
 * @param {number} id - The component ID to remove.
 */
export function removeComponent(id) {
	delete registry[id];
}

/**
 * Returns the current number of registered components.
 *
 * @returns {number} Number of active components in the registry.
 */
export function getRegistrySize() {
	return Object.keys(registry).length;
}
