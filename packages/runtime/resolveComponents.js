import { getComponent, removeComponent } from "./componentRegistry.js";
import { mount } from "./mount.js";

const COMPONENT_TAG = "udodi-component";

/**
 * Component IDs known to originate under structural directives.
 *
 * IDs are unique to their component placeholders and are reused only
 * when the corresponding structural template is cloned. Consequently,
 * structural status can safely be cached globally by ID.
 *
 * @type {Set<number>}
 */
const structuralIds = new Set();

/**
 * Reads a component placeholder ID.
 *
 * @param {Element} element - Placeholder element.
 * @returns {number|null} The numeric ID, or null if invalid.
 */
function getPlaceholderId(element) {
	const rawId = element.getAttribute("id");

	if (rawId === null || rawId === "") {
		return null;
	}

	const id = Number(rawId);
	return Number.isInteger(id) ? id : null;
}

/**
 * Determines whether a placeholder lives under a structural directive
 * (`@for`, `@if`, `@elseif`, or `@else`).
 *
 * The result is cached globally by component ID so subsequent checks
 * (including those performed on clones that reuse the same ID) are O(1).
 *
 * @param {Element} element - Placeholder to inspect.
 * @param {Element} root - Subtree boundary (walk stops here).
 * @param {number} id - Numeric component ID used as cache key.
 * @returns {boolean}
 */
function hasStructuralAncestor(element, root, id) {
	if (structuralIds.has(id)) {
		return true;
	}

	let current = element.parentElement;
	let result = false;

	while (current) {
		if (
			current.hasAttribute("@for") ||
			current.hasAttribute("@if") ||
			current.hasAttribute("@elseif") ||
			current.hasAttribute("@else")
		) {
			result = true;
			break;
		}

		if (current === root) {
			break;
		}

		current = current.parentElement;
	}

	if (result) {
		structuralIds.add(id);
	}

	return result;
}

/**
 * Finds the next component placeholder eligible for resolution.
 *
 * The collection is live and may change during mounting. Structural
 * placeholders are remembered by ID in the global `structuralIds` set so
 * their ancestor checks are never repeated.
 *
 * The collection is scanned from the beginning on each call. This
 * deliberately avoids a persistent index that could become invalid when
 * mounting inserts or removes elements.
 *
 * @param {HTMLCollectionOf<Element>} customElements
 *   Live component placeholder collection.
 * @param {Element} root - Subtree root used as the walk boundary.
 * @param {boolean} skipStructural - Whether to skip structural placeholders.
 * @returns {Element|null} The next eligible placeholder.
 */
function findNextComponent(customElements, root, skipStructural) {
	for (let i = 0; i < customElements.length; i++) {
		const element = customElements[i];

		if (!skipStructural) {
			return element;
		}

		const id = getPlaceholderId(element);

		// Fast path: already known to be structural
		if (id !== null && structuralIds.has(id)) {
			continue;
		}

		// First encounter: perform the walk and cache the result by ID
		if (id !== null && hasStructuralAncestor(element, root, id)) {
			continue;
		}

		return element;
	}

	return null;
}

/**
 * Resolves component placeholders in a live DOM subtree.
 *
 * Non-structural placeholders are resolved and their registry entries
 * removed by default. Placeholders inside structural directives retain
 * their registry entries for reuse by cloned templates.
 *
 * Structural placeholders are skipped when `skipStructural` is true.
 * The resolver accounts for DOM changes caused by mounting by scanning
 * the live collection afresh after each resolution.
 *
 * Structural status is cached globally by component ID, making repeated
 * ancestor walks unnecessary even across different resolve passes and
 * across clones that reuse the same ID.
 *
 * @param {Element} root - Subtree containing component placeholders.
 * @param {Object} vm - Virtual machine instance.
 * @param {?number} [parentBoundary=null] - Parent CSS scope boundary.
 * @param {Object} [options={}] - Resolution options.
 * @param {boolean} [options.skipStructural=false]
 *   Skip placeholders inside structural directives.
 * @param {boolean} [options.removeFromRegistry=true]
 *   Remove eligible entries from the component registry after mounting.
 * @returns {void}
 */
export function resolveComponents(
	root,
	vm,
	parentBoundary = null,
	options = {},
) {
	const {
		skipStructural = false,
		removeFromRegistry = true,
	} = options;

	// Live collection reflects DOM changes during mounting
	const customElements = root.getElementsByTagName(COMPONENT_TAG);

	while (customElements.length > 0) {
		const elem = findNextComponent(customElements, root, skipStructural);

		if (elem === null) {
			break;
		}

		const id = getPlaceholderId(elem);

		if (id === null) {
			elem.remove();
			continue;
		}

		const entry = getComponent(id);

		if (!entry) {
			elem.remove();
			continue;
		}

		// Capture ancestry (or retrieve from global ID cache) before any
		// DOM mutation occurs.
		const isStructural = hasStructuralAncestor(elem, root, id);

		mount(
			entry.Component(entry.props),
			elem,
			vm,
			parentBoundary,
		);

		const realRoot = elem.firstElementChild;

		if (realRoot) {
			elem.before(realRoot);
		}

		// Remove the placeholder from the live collection
		elem.remove();

		// Remove the registry entry only if it's not under the structural directive
		if (removeFromRegistry && !isStructural) {
			removeComponent(id);
		}
	}
}
