/**
 * Maps component root elements to their cleanup functions.
 *
 * Cleanup functions are executed when a mounted component is
 * removed from the document.
 *
 * @type {WeakMap<Element, Function>}
 */
export const cleanupFunctions = new WeakMap();

/**
 * Maps component root elements to their unmount functions.
 *
 * Unmount functions perform a full component teardown,
 * including cleanup and DOM removal.
 *
 * @type {WeakMap<Element, Function>}
 */
export const unmountFunctions = new WeakMap();

/**
 * Global MutationObserver used to detect when mounted component
 * trees are removed from the DOM.
 *
 * Lazily initialized via {@link getCleanupObserver}.
 *
 * @type {MutationObserver|null}
 */
let cleanupObserver = null;

/**
 * Executes all registered cleanup callbacks within a scope.
 *
 * This includes:
 * - Reactive effect cleanup functions
 * - User-provided cleanup callbacks
 *
 * Any errors thrown during cleanup are caught and logged so
 * that remaining cleanup handlers can continue executing.
 *
 * @param {Object} scope - Scope object.
 * @param {Function[]} [scope.effects] - Reactive effect cleanup callbacks.
 * @param {Function[]} [scope.cleanups] - User cleanup callbacks.
 * @param {string} [label="scope"] - Label used in warning messages.
 * @returns {void}
 */
export function runScopeCleanup(scope, label = "scope") {
	if (!scope) return;

    const effects = scope.effects;

    if (effects) {
        const effectsLength = effects.length;

        for (let i = 0; i < effectsLength; i++) {
            try {
                effects[i](); // Execute reactive effect cleanup
            } catch (err) {
                console.warn(`[cleanup] effect error (${label}):`, err);
            }
        }
    }

    const cleanups = scope.cleanups;

    if (cleanups) {
        const cleanupsLength = cleanups.length;

        for (let i = 0; i < cleanupsLength; i++) {
            try {
                cleanups[i](); // Execute user-provided or registered cleanup
            } catch (err) {
                console.warn(`[cleanup] cleanup error (${label}):`, err);
            }
        }
    }
}

/**
 * Registers a mounted component root and its lifecycle handlers.
 *
 * @param {Element} root - Component root element.
 * @param {Function} cleanup - Cleanup function executed when the component is detached.
 * @param {Function} unmount - Unmount function for explicit teardown.
 * @returns {void}
 */
export function registerRoot(root, cleanup, unmount) {
	if (!root) return;

	cleanupFunctions.set(root, cleanup);
	unmountFunctions.set(root, unmount);
}

/**
 * Removes a component root and its lifecycle handlers from the registry.
 *
 * @param {Element} root - Component root element.
 * @returns {void}
 */
export function unregisterRoot(root) {
	if (!root) return;

	cleanupFunctions.delete(root);
	unmountFunctions.delete(root);
}

/**
 * Returns the global cleanup observer.
 *
 * The observer watches the entire document for removed DOM nodes
 * and automatically triggers component cleanup when a mounted
 * component tree is detached.
 *
 * The observer is created only once and reused thereafter.
 *
 * @returns {MutationObserver} Global cleanup observer.
 */
export function getCleanupObserver() {
    if (cleanupObserver) {
		return cleanupObserver;
	}

	cleanupObserver = new MutationObserver((mutations) => {
        const mutationsLength = mutations.length;

		for (let i = 0; i < mutationsLength; i++) {

            const removedNodes = mutations[i].removedNodes;
            const removedNodesLength = removedNodes.length;

            for (let j = 0; j < removedNodesLength; j++) {
                const node = removedNodes[j];

                if (node.nodeType === Node.ELEMENT_NODE) {
                    // If the root node is reconnected elsewhere, skip the whole tree
                    if (!node.isConnected) {
                        traverse(node);
                    }
                }
            }
        }
	});

	cleanupObserver.observe(document.documentElement, {
		childList: true,
		subtree: true,
	});

	return cleanupObserver;
}

/**
 * Traverses a detached DOM subtree and executes cleanup handlers
 * for any registered component roots encountered.
 *
 * Traversal is depth-first using element siblings and children.
 *
 * @private
 * @param {Element} root - Root node of the detached subtree.
 * @returns {void}
 */
function traverse(root) {
	const stack = [root];

	while (stack.length > 0) {
		const node = stack.pop();
		const cleanup = cleanupFunctions.get(node);

        if (cleanup) {
            cleanup();
        }

		let child = node.lastElementChild;

		while (child) {
			stack.push(child);
			child = child.previousElementSibling;
		}
	}
}
