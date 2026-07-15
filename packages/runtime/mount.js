import { getComponent, removeComponent } from "./componentRegistry.js";
import { extractAllDirectives } from "./directive.js";
import { bindDOM } from "./bindDOM.js";

import {
	getCleanupObserver,
	registerRoot,
	unregisterRoot,
	runScopeCleanup,
} from "./lifecycle.js";

/**
 * Resolves component placeholders within a mounted subtree.
 *
 * Each placeholder is expected to be a `<udodi-component>` element with an
 * `id` attribute whose value references a component definition stored in 
 * the component registry.
 *
 * The component is mounted into the placeholder element, and the placeholder 
 * is then replaced with the component's actual root element.
 *
 * This function uses a live collection loop on the scoped root subtree rather 
 * than a static snapshot or TreeWalker traversal. This ensures that if mounting 
 * a component introduces additional nested component placeholders, they are 
 * dynamically appended to the collection and resolved in subsequent iterations.
 *
 * @param {Element} root - The scoped DOM subtree root element to search within.
 * @param {Object} vm - The virtual machine instance to pass to the mount engine.
 * @param {?number} [parentBoundary] - The scope identifier of the parent component.
 * @returns {void}
 */
function resolveComponents(root, vm, parentBoundary) {
	const customElements = root.getElementsByTagName('udodi-component');

	// Keep running as long as a <udodi-component> exists
	while (customElements.length > 0) {
		// Always take the first one, as the list is live and will 
		// update as we replace/remove elements.
		const elem = customElements[0];
		
		const id = Number(elem.getAttribute("id"));
		const componentDef = getComponent(id);

		if (!componentDef) {
			// If no component definition is found, remove the placeholder to avoid infinite loop
			elem.remove();
			continue;
		}

		const { Component, props } = componentDef;

		// Mount component into placeholder.
		mount(Component(props), elem, vm, parentBoundary);

		// Grab the actual component root.
		const realRoot = elem.firstElementChild;

		if (realRoot) {
			// Place the clean root right before the placeholder in the DOM
			elem.before(realRoot);
		}

		// This absolutely guarantees customElements.length shrinks by 1
		elem.remove();

		// Remove component definition from registry
		removeComponent(id);
	}
}

/**
 * Mounts a component instance into a DOM container.
 *
 * The component's template is converted into a DOM fragment, nested
 * `<udodi-component>` placeholders are resolved recursively, directives are
 * bound, lifecycle hooks are registered, and the resulting DOM is appended
 * to the container.
 *
 * If the component defines scoped CSS, `mount()` also establishes the
 * component's CSS `@scope` boundaries by:
 *
 * - Setting `ud-scope-start="<scopeId>"` on the component root.
 * - Setting `ud-scope-end="<parentBoundary>"` on the root when mounted
 *   inside another scoped component.
 * - Appending a trailing boundary element with
 *   `ud-scope-end="<scopeId>"` to terminate the component's scope.
 *
 * The component's scope identifier is then propagated to nested component
 * mounts so that parent styles do not bleed into child component trees.
 *
 * @param {Object} component - The component instance returned by
 * `Component(props)`. Must contain a `template` property and may contain
 * `context`, `publicContext`, `scopeId`, `onMount`, and `onUnmount`.
 * @param {HTMLElement} container - The DOM element into which the component
 * will be mounted.
 * @param {Object} vm - The virtual machine instance used for directive
 * evaluation and execution.
 * @param {?number} [parentBoundary] - The scope identifier of the
 * parent component. Used to establish CSS `@scope` end boundaries and
 * prevent style leakage into nested component trees.
 * @returns {{
 *   name: string,
 *   context: Object,
 *   unmount: Function
 * }} The mounted component instance API.
 */
export function mount(component, container, vm, parentBoundary = null) {
	const componentName = component.name;

	if (!component.template) {
		throw new Error(
			`[mount] Component ${componentName} must return { template }`,
		);
	}

	const scope = { effects: [], cleanups: [] };
	const range = document.createRange();

	// To avoid issues with the range being detached, 
	// we select the container's contents.
	range.selectNodeContents(container);

	const fragment = range.createContextualFragment(component.template);
	const root = fragment.firstElementChild;

	if (!root) {
		throw new Error(
			`[mount] Component ${componentName} must have one root element`,
		);
	}
	if (fragment.children.length > 1) {
		throw new Error(
			`[mount] Component ${componentName} must have exactly ONE root element`
		);
	}

	let destroyed = false;

	const cleanup = () => {
		if (destroyed) return;

		destroyed = true;
		component.onUnmount?.(root);
		runScopeCleanup(scope, "[mount]");
		unregisterRoot(root);
	};

	const unmount = () => {
		cleanup();

		if (root.isConnected) {
			root.remove();
		}
	};

	let ownBoundary = parentBoundary;

	// Set the CSS @scope start and end boundaries
	if (component.scopeId !== null) {
		root.setAttribute("ud-scope-start", component.scopeId);

		if (parentBoundary !== null) {
			root.setAttribute("ud-scope-end", parentBoundary);
		}

		ownBoundary = component.scopeId;
	}

	// Resolve nested components (they will replace their own placeholders)
	resolveComponents(root, vm, ownBoundary);

	const directives = extractAllDirectives(root);
	const context = component.context || {};

	try {
		bindDOM(directives, vm, context, scope);

		registerRoot(root, cleanup, unmount);

		context.cleanup = (fn) => {
			scope.cleanups.push(fn);
		};

		// Inject the runtime cleanup capability into the sandbox membrane safely
		if (component.publicContext) {
			component.publicContext._injectCleanupHook = (fn) => {
				scope.cleanups.push(fn);
			};
		}

		// Replace container's content with component
		container.appendChild(fragment);

		component.onMount?.(root);

	} catch (err) {
		cleanup();
		throw err;
	}

	getCleanupObserver();

	return {
		name: componentName,
		context: component.publicContext,
		unmount,
	};
}
