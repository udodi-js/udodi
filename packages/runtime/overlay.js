import { createComponent } from "./createComponent.js";
import { render as renderComponent } from "./render.js";

const OVERLAY_ID = "udodi-overlay-root";
const OVERLAY_HOST = "[udodi-overlay-host]";
const OVERLAY_BACKDROP = "[udodi-overlay-backdrop]";
const OVERLAY_LAYER = "[udodi-overlay-layer]";

const FOCUSABLE_SELECTOR = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled]):not([type='hidden'])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex='-1'])",
].join(",");

const DEFAULT_OPTIONS = {
	renderBackdrop: true,
	closeOnBackdrop: true,
	closeOnEscape: true,
	lockScroll: true,
	focusTrap: true,
	zIndex: undefined,
	className: undefined,
};

let overlayRoot = null;
let stylesInjected = false;

/**
 * Whether the document-level Escape listener is currently attached.
 *
 * Attached when the first modal opens and detached when the stack
 * becomes empty so no global keydown work runs with no overlays open.
 *
 * @type {boolean}
 */
let escapeListenerAttached = false;

/**
 * Active overlay stack.
 *
 * The last entry is always the top-most overlay.
 *
 * @type {Array<object>}
 */
const modalStack = [];

/**
 * Ref-counted scroll lock ownership.
 *
 * @type {number}
 */
let scrollLockCount = 0;

/**
 * Original inline body overflow value captured when scroll locking begins.
 *
 * Restored when the final scroll-lock owner closes.
 *
 * @type {string}
 */
let previousBodyOverflow = "";

/**
 * Inject minimal runtime overlay CSS.
 *
 * Only structural/runtime CSS is injected.
 * No opinionated visual styling beyond the backdrop.
 *
 * Default z-index lives on the host attribute selector. Per-modal
 * z-index is applied inline via the `zIndex` option so apps can
 * escape stacking-context conflicts without overriding framework CSS.
 *
 * @returns {void}
 */
function injectOverlayStyles() {
	if (stylesInjected) return;

	stylesInjected = true;

	const style = document.createElement("style");

	style.setAttribute("udodi-overlay-styles", "");

	style.textContent = `
		[udodi-overlay-host] {
			position: fixed;
			inset: 0;
			z-index: 9999;
		}

		[udodi-overlay-backdrop] {
			position: absolute;
			inset: 0;
			background: rgba(0, 0, 0, 0.5);
		}

		[udodi-overlay-layer] {
			position: absolute;
			inset: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 24px;
			pointer-events: none;
		}

		[udodi-overlay-panel] {
			position: relative;
			pointer-events: auto;
		}
	`;

	document.head.appendChild(style);
}

/**
 * Ensure the shared overlay root exists.
 *
 * The root is reused for all modal instances. Each modal is mounted into
 * its own child container under this root so stacked overlays do not
 * replace one another.
 *
 * @returns {HTMLElement} Shared overlay root.
 */
export function ensureOverlayRoot() {
	if (overlayRoot?.isConnected) {
		return overlayRoot;
	}

	overlayRoot = document.getElementById(OVERLAY_ID);

	if (!overlayRoot) {
		overlayRoot = document.createElement("div");
		overlayRoot.id = OVERLAY_ID;

		document.body.appendChild(overlayRoot);
	}

	return overlayRoot;
}

/**
 * Lock document scrolling.
 *
 * Scroll locking is reference-counted so multiple overlays can
 * coexist without releasing the lock prematurely.
 *
 * `overflow: hidden` is re-applied on every acquire so the lock stays
 * effective if something external cleared the inline style while the
 * count was still greater than zero.
 *
 * @returns {void}
 */
function lockScroll() {
	scrollLockCount++;

	if (scrollLockCount === 1) {
		previousBodyOverflow = document.body.style.overflow;
	}

	document.body.style.overflow = "hidden";
}

/**
 * Unlock document scrolling.
 *
 * The original inline body overflow value is restored when the final
 * scroll-lock owner closes.
 *
 * @returns {void}
 */
function unlockScroll() {
	if (scrollLockCount === 0) {
		return;
	}

	scrollLockCount--;

	if (scrollLockCount !== 0) {
		return;
	}

	document.body.style.overflow = previousBodyOverflow;
	previousBodyOverflow = "";
}

/**
 * Restore focus safely.
 *
 * Focus restoration can fail when the previous element has been removed
 * from the document or is otherwise no longer focusable.
 *
 * @param {Element|null} element
 * @returns {void}
 */
function restoreFocus(element) {
	try {
		element?.focus?.();
	} catch {
		// Ignore focus restoration failures.
	}
}

/**
 * Collect visible, focusable elements inside a container.
 *
 * Elements hidden from the layout or accessibility tree are excluded.
 *
 * @param {ParentNode} container
 * @returns {HTMLElement[]}
 */
function getFocusableElements(container) {
	const nodes = container.querySelectorAll(FOCUSABLE_SELECTOR);
	const result = [];

	for (let i = 0, len = nodes.length; i < len; i++) {
		const element = nodes[i];

		// Skip elements hidden from assistive technology.
		if (element.closest("[hidden], [aria-hidden='true']")) {
			continue;
		}

		// Skip elements that are not visible / not tabbable in practice.
		if (
			element.offsetWidth === 0 &&
			element.offsetHeight === 0 &&
			element.getClientRects().length === 0
		) {
			continue;
		}

		result.push(element);
	}

	return result;
}

/**
 * Install a minimal Tab / Shift+Tab focus trap on a dialog layer.
 *
 * Focus cycles within the layer. Only the top-most modal traps focus.
 * When the layer has no focusable descendants, focus remains on the layer.
 *
 * @param {HTMLElement} layer - The `[udodi-overlay-layer]` element.
 * @param {object} modal - Modal entry on the stack.
 * @returns {Function} Cleanup function that removes the keydown listener.
 */
function installFocusTrap(layer, modal) {
	const onKeydown = (event) => {
		if (event.key !== "Tab") {
			return;
		}

		// Only the top-most modal may trap focus.
		if (modalStack[modalStack.length - 1] !== modal) {
			return;
		}

		const focusable = getFocusableElements(layer);

		// Nothing focusable: keep focus on the layer itself.
		if (focusable.length === 0) {
			event.preventDefault();
			layer.focus();
			return;
		}

		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const active = document.activeElement;

		if (event.shiftKey) {
			if (active === first || active === layer || !layer.contains(active)) {
				event.preventDefault();
				last.focus();
			}

			return;
		}

		if (active === last || active === layer || !layer.contains(active)) {
			event.preventDefault();
			first.focus();
		}
	};

	layer.addEventListener("keydown", onKeydown);

	return () => {
		layer.removeEventListener("keydown", onKeydown);
	};
}

/**
 * Global Escape handler.
 *
 * Only the top-most overlay can consume Escape.
 * Registered only while at least one modal is open.
 *
 * @param {KeyboardEvent} event
 * @returns {void}
 */
function globalKeydownHandler(event) {
	if (event.key !== "Escape") {
		return;
	}

	const top = modalStack[modalStack.length - 1];

	if (!top || !top.config.closeOnEscape) {
		return;
	}

	top.close(false);
}

/**
 * Attach the document-level Escape listener when the first modal opens.
 *
 * @returns {void}
 */
function attachEscapeListener() {
	if (escapeListenerAttached) {
		return;
	}

	escapeListenerAttached = true;
	document.addEventListener("keydown", globalKeydownHandler);
}

/**
 * Detach the document-level Escape listener when the modal stack is empty.
 *
 * @returns {void}
 */
function detachEscapeListener() {
	if (!escapeListenerAttached || modalStack.length > 0) {
		return;
	}

	escapeListenerAttached = false;
	document.removeEventListener("keydown", globalKeydownHandler);
}

/**
 * Close a specific modal.
 *
 * Closing is idempotent. The modal is removed from the active stack,
 * its component instance is unmounted, its dedicated mount target is
 * removed from the shared overlay root, scroll ownership is released,
 * focus is restored, and the returned promise is resolved.
 *
 * When the closed modal is the top of the stack, removal is a simple
 * `pop()`; otherwise the stack is scanned with `indexOf`.
 *
 * @param {object|null} modal
 * @param {*} [result=false]
 * @returns {void}
 */
function closeModal(modal, result = false) {
	if (!modal || modal.closed) {
		return;
	}

	modal.closed = true;

	if (modalStack[modalStack.length - 1] === modal) {
		modalStack.pop();
	} else {
		const index = modalStack.indexOf(modal);

		if (index !== -1) {
			modalStack.splice(index, 1);
		}
	}

	modal.instance?.unmount?.();

	if (modal.config.lockScroll) {
		unlockScroll();
	}

	restoreFocus(modal.previousActiveElement);

	modal.resolve?.(result);
	detachEscapeListener();
}

/**
 * Close the top-most modal.
 *
 * @param {*} [result=false]
 * @returns {void}
 */
export function closeTopModal(result = false) {
	const top = modalStack[modalStack.length - 1];

	if (!top) {
		return;
	}

	closeModal(top, result);
}

/**
 * Open a modal overlay.
 *
 * @param {Function} render
 * A function that returns modal content.
 * Receives a `close(result)` function.
 *
 * @param {object} [options]
 * Overlay configuration.
 *
 * @param {boolean} [options.renderBackdrop=true]
 * Whether to render the dimmed backdrop.
 *
 * @param {boolean} [options.closeOnBackdrop=true]
 * Close when the backdrop is clicked.
 *
 * @param {boolean} [options.closeOnEscape=true]
 * Close when Escape is pressed (top modal only).
 *
 * @param {boolean} [options.lockScroll=true]
 * Lock document scrolling while open.
 *
 * @param {boolean} [options.focusTrap=true]
 * Trap Tab / Shift+Tab focus inside the dialog panel.
 *
 * @param {number|string} [options.zIndex]
 * Inline z-index on the overlay host (overrides the default 9999).
 *
 * @param {string} [options.className]
 * Extra class name(s) applied to the overlay host element.
 *
 * @returns {Promise<*>}
 */
export function openModal(render, options = {}) {
	injectOverlayStyles();

	return new Promise((resolve) => {
		const config = {
			...DEFAULT_OPTIONS,
			...options,
		};

		const root = ensureOverlayRoot();

		if (config.lockScroll) {
			lockScroll();
		}

		const previousActiveElement = document.activeElement;

		const modal = {
			resolve,
			config,
			closed: false,
			instance: null,
			previousActiveElement,
			close: null,
		};

		/**
		 * Close helper exposed to modal content.
		 *
		 * @param {*} [result=false]
		 * @returns {void}
		 */
		const close = (result = false) => {
			closeModal(modal, result);
		};

		modal.close = close;
		modalStack.push(modal);
		attachEscapeListener();

		/**
		 * Modal template.
		 *
		 * The host class is applied after mounting rather than interpolated
		 * into the template, avoiding HTML attribute construction from
		 * user-provided class names.
		 *
		 * @returns {string}
		 */
		const modalTemplate = () => {
			const content = render(close);

			return `
				<div udodi-overlay-host>
					${config.renderBackdrop ? `<div udodi-overlay-backdrop></div>` : ""}

					<div
						udodi-overlay-layer
						role="dialog"
						aria-modal="true"
						tabindex="-1"
					>
						<div udodi-overlay-panel>
							${content}
						</div>
					</div>
				</div>
			`;
		};

		/**
		 * Modal wrapper component.
		 *
		 * @returns {object}
		 */
		const ModalRoot = createComponent({
			name: "UdodiOverlay",
			template: modalTemplate,

			onMount(rootElement, ctx) {
				const host =
					rootElement.querySelector(OVERLAY_HOST) || 
					(rootElement.hasAttribute?.("udodi-overlay-host") 
						? rootElement 
						: rootElement.firstElementChild);

				const layer = rootElement.querySelector(OVERLAY_LAYER);

				const backdrop = config.renderBackdrop 
					? rootElement.querySelector(OVERLAY_BACKDROP) 
					: null;

				if (host) {
					/**
					 * Apply per-modal z-index when provided.
					 */
					if (config.zIndex != null) {
						host.style.zIndex = String(config.zIndex);
					}

					/**
					 * Apply optional classes directly to the host rather
					 * than interpolating them into the HTML template.
					 */
					if (
						typeof config.className === "string" && 
						config.className !== "" 
					) {
						host.className = config.className;
					}
				}

				/**
				 * Close the modal when the backdrop itself is clicked.
				 *
				 * The backdrop contains no interactive children, so a
				 * direct listener avoids delegated click handling and
				 * repeated `closest()` lookups.
				 */
				const onBackdropClick = () => {
					if (config.closeOnBackdrop) {
						close(false);
					}
				};

				backdrop?.addEventListener("click", onBackdropClick);

				/**
				 * Focus trap cleanup is installed asynchronously after the
				 * initial DOM has been mounted.
				 *
				 * @type {Function|null}
				 */
				let removeFocusTrap = null;

				queueMicrotask(() => {
					if (modal.closed || !layer) {
						return;
					}

					/**
					 * Focus the dialog layer first so keyboard interaction
					 * starts inside the newly opened overlay.
					 */
					layer.focus();

					if (config.focusTrap) {
						removeFocusTrap = installFocusTrap(layer, modal);
					}
				});

				ctx.cleanup(() => {
					backdrop?.removeEventListener("click", onBackdropClick);
					removeFocusTrap?.();
				});
			},
		});

		modal.instance = renderComponent(ModalRoot(), root);
	});
}
