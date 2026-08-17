import { getComponent, removeComponent } from "./componentRegistry.js";
import { mount } from "./mount.js";

const COMPONENT_TAG = "udodi-component";

const STRUCTURAL_ATTRIBUTES = ["@for", "@if", "@elseif", "@else"];
const STRUCTURAL_ATTRIBUTES_LENGTH = STRUCTURAL_ATTRIBUTES.length;

/**
 * Returns true when an element is inside a structural template boundary.
 *
 * @param {Element} element - Element to inspect.
 * @param {Element} root - Traversal root.
 * @returns {boolean}
 */
function hasStructuralAncestor(element, root) {
	let current = element.parentElement;

	while (current) {
		for (let i = 0; i < STRUCTURAL_ATTRIBUTES_LENGTH; i++) {
			if (current.hasAttribute(STRUCTURAL_ATTRIBUTES[i])) {
				return true;
			}
		}

		if (current === root) {
			break;
		}

		current = current.parentElement;
	}

	return false;
}

/**
 * Finds the next component placeholder eligible for resolution.
 *
 * The component collection is live, so the caller must resolve and remove
 * the returned element before requesting the next one.
 *
 * @param {HTMLCollectionOf<Element>} customElements
 * @param {Element} root
 * @param {boolean} skipStructural
 * @returns {Element|null}
 */
function findNextComponent(customElements, root, skipStructural) {
	if (!skipStructural) {
		return customElements[0] ?? null;
	}

	for (let i = 0, length = customElements.length; i < length; i++) {
		const element = customElements[i];

		if (!hasStructuralAncestor(element, root)) {
			return element;
		}
	}

	return null;
}

/**
 * Reads a component placeholder id.
 *
 * @param {Element} element - Placeholder element.
 * @returns {number|null}
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
 * Captures component registry entries referenced by a structural template.
 *
 * Structural directives clone their branch templates later, after the public
 * render registry may have been cleared. Capturing the entries lets each clone
 * create fresh component instances from the original placeholder ids.
 *
 * @param {Element} root - Structural template root.
 * @param {Map<number, Object>} [inheritedDefinitions] - Parent template entries.
 * @returns {Map<number, Object>}
 */
export function collectComponentDefinitions(root, inheritedDefinitions) {
	const definitions = new Map();
	const placeholders = root.getElementsByTagName(COMPONENT_TAG);

	for (let i = 0, length = placeholders.length; i < length; i++) {
		const placeholder = placeholders[i];
		const id = getPlaceholderId(placeholder);

		if (id === null || definitions.has(id)) {
			continue;
		}

		const entry = inheritedDefinitions?.get(id) ?? getComponent(id);

		if (entry) {
			definitions.set(id, entry);
		}
	}

	return definitions;
}

/**
 * Resolves component placeholders in a live DOM subtree.
 *
 * @param {Element} root - Subtree root.
 * @param {Object} vm - Virtual machine instance.
 * @param {?number} [parentBoundary] - Parent CSS scope boundary.
 * @param {Object} [options] - Resolution options.
 * @param {boolean} [options.skipStructural=false]
 *   Skip placeholders inside structural templates.
 * @param {Map<number, Object>} [options.definitions]
 *   Captured structural component definitions.
 * @param {boolean} [options.removeFromRegistry=true]
 *   Remove resolved global registry entries.
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
		definitions = null,
		removeFromRegistry = true,
	} = options;

	// Deliberately use a live HTMLCollection. Components are removed from
	// the DOM during resolution, so the collection must reflect those
	// mutations immediately.
	const customElements = root.getElementsByTagName(COMPONENT_TAG);

	while (customElements.length > 0) {
		const elem = findNextComponent(
			customElements,
			root,
			skipStructural,
		);

		if (elem === null) {
			break;
		}

		if (!elem.parentNode) {
			continue;
		}

		const id = getPlaceholderId(elem);

		if (id === null) {
			elem.remove();
			continue;
		}

		const entry = definitions?.get(id) ?? getComponent(id);

		if (!entry) {
			elem.remove();
			continue;
		}

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

		// This absolutely guarantees customElements.length shrinks by 1
		elem.remove();

		if (removeFromRegistry && !definitions?.has(id)) {
			removeComponent(id);
		}
	}
}
