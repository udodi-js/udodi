let scopeId = 0;
let styleElement = null;
let cssText = "";
let dirty = false;

/**
 * Tracks registered component scopes.
 *
 * The map is only used to prevent duplicate registrations.
 *
 * @type {Map<number, true>}
 */
const registry = new Map();

/**
 * Creates a new unique CSS scope identifier.
 *
 * @returns {number} The next scope identifier.
 */
export function createScopeId() {
	return ++scopeId;
}

/**
 * Registers a scoped CSS block.
 *
 * The CSS block is generated once and appended to the internal
 * stylesheet buffer. Duplicate scope IDs are ignored.
 *
 * @param {number} scopeId - Unique scope identifier.
 * @param {string} [css=""] - Component CSS.
 */
export function registerScope(scopeId, css = "") {
	if (css === "" || registry.has(scopeId)) {
		return;
	}

	registry.set(scopeId, true);

	cssText += `
        @scope ([ud-scope-start="${scopeId}"]) to ([ud-scope-end="${scopeId}"]) {
        	${css}
        }
    `;

	dirty = true;
}

/**
 * Renders all registered scoped CSS into a single
 * `<style id="udodi-styles">` element.
 *
 * If no new styles have been registered since the last render,
 * this function does nothing.
 */
export function renderStyles() {
	if (!dirty) {
		return;
	}

	if (!styleElement) {
		styleElement = document.head.appendChild(
			document.createElement("style")
		);

		styleElement.id = "udodi-styles";
	}

	styleElement.textContent = cssText;

	dirty = false;
}
