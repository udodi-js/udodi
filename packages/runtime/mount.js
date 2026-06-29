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
 * @returns {void}
 */
function resolveComponents(root, vm) {
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
		mount(Component(props), elem, vm);

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
 * Mounts a component to a DOM container.
 *
 * @param {Function} component - The component object with a `template` property, etc.
 * @param {HTMLElement} container - The DOM element to mount the component to.
 * @param {Object} vm - The virtual machine instance.
 * @returns {Object} The mounted component instance.
 */
export function mount(component, container, vm) {
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
		throw new Error(`[mount] Component ${componentName} must have exactly ONE root element`);
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

	// Resolve nested components (they will replace their own placeholders)
	resolveComponents(root, vm);

	const directives = extractAllDirectives(root);
	const context = component.context || {};

	try {
		scope._root = root;
		bindDOM(directives, vm, context, scope);

		registerRoot(root, cleanup, unmount);

		context.cleanup = (fn) => {
			scope.cleanups.push(fn);
		};

		// Inject the runtime cleanup capability into the sandbox membrane safely
		if (component._membrane) {
			component._membrane._injectCleanupHook = (fn) => {
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

	component.unmount = unmount;
	getCleanupObserver();

	return component;
}
