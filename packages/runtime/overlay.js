import { mount } from "./mount.js";

const OVERLAY_ID = "udodi-overlay-root";

let overlayRoot = null;
let stylesInjected = false;

/**
 * Inject minimal runtime overlay CSS.
 * Only structural/runtime CSS is injected.
 * No opinionated visual styling beyond the backdrop.
 *
 * Default z-index lives on the host attribute selector. Per-modal
 * z-index is applied inline via the `zIndex` option so apps can
 * escape stacking-context conflicts without overriding framework CSS.
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
 * Ensure shared overlay root exists.
 */
export function ensureOverlayRoot() {
	if (overlayRoot) {
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
 * Active overlay stack.
 */
const modalStack = [];

/**
 * Ref-counted scroll lock ownership.
 */
let scrollLockCount = 0;

/**
 * Lock document scrolling.
 */
function lockScroll() {
	scrollLockCount++;

	if (scrollLockCount !== 1) return;

	document.body.style.overflow = "hidden";
}

/**
 * Unlock document scrolling.
 */
function unlockScroll() {
	scrollLockCount--;

	if (scrollLockCount > 0) {
		return;
	}

	scrollLockCount = 0;

	document.body.style.overflow = "";
}

/**
 * Restore focus safely.
 */
function restoreFocus(element) {
	try {
		element?.focus?.();
	} catch {
		// Ignore focus restoration failures
	}
}

/**
 * Focusable element selector used by the focus trap.
 */
const FOCUSABLE_SELECTOR = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled]):not([type='hidden'])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Collect visible, focusable elements inside a container.
 *
 * @param {ParentNode} container
 * @returns {HTMLElement[]}
 */
function getFocusableElements(container) {
	const nodes = container.querySelectorAll(FOCUSABLE_SELECTOR);
	const result = [];

	for (let i = 0, len = nodes.length; i < len; i++) {
		const el = nodes[i];

		// Skip elements that are not visible / not tabbable in practice.
		if (el.closest("[hidden], [aria-hidden='true']")) {
			continue;
		}

		if (
			el.offsetWidth === 0 &&
			el.offsetHeight === 0 &&
			el.getClientRects().length === 0
		) {
			continue;
		}

		result.push(el);
	}

	return result;
}

/**
 * Install a minimal Tab / Shift+Tab focus trap on a dialog layer.
 *
 * Focus cycles within the panel (or the layer itself when no focusable
 * children exist). Only active while this modal is the top of the stack.
 *
 * @param {HTMLElement} layer - The [udodi-overlay-layer] element.
 * @param {Object} modal - Modal entry on the stack.
 * @returns {Function} Cleanup function that removes the keydown listener.
 */
function installFocusTrap(layer, modal) {
	const onKeydown = (event) => {
		if (event.key !== "Tab") return;

		// Only the top-most modal may trap focus.
		if (modalStack[modalStack.length - 1] !== modal) return;

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
		} else {
			if (active === last || active === layer || !layer.contains(active)) {
				event.preventDefault();
				first.focus();
			}
		}
	};

	layer.addEventListener("keydown", onKeydown);

	return () => {
		layer.removeEventListener("keydown", onKeydown);
	};
}

/**
 * Global Escape handler.
 * Only the top overlay can consume Escape.
 */
function globalKeydownHandler(event) {
	if (event.key !== "Escape") return;

	const top = modalStack[modalStack.length - 1];

	if (!top) return;

	if (!top.config.closeOnEscape) return;

	top.close(false);
}

document.addEventListener("keydown", globalKeydownHandler);

/**
 * Close a specific modal.
 */
function closeModal(modal, result = false) {
	if (!modal) return;

	if (modal.closed) return;

	modal.closed = true;

	modal.instance?.unmount?.();

	const index = modalStack.indexOf(modal);

	if (index !== -1) {
		modalStack.splice(index, 1);
	}

	if (modal.config.lockScroll) {
		unlockScroll();
	}

	restoreFocus(modal.previousActiveElement);

	modal.resolve?.(result);
}

/**
 * Close the top-most modal.
 */
export function closeTopModal(result = false) {
	const top = modalStack[modalStack.length - 1];

	if (!top) return;

	closeModal(top, result);
}

/**
 * Open a modal overlay.
 *
 * @param {function} render
 * A function that returns modal content.
 * Receives a `close(result)` function.
 *
 * @param {object} [options]
 * Overlay configuration.
 * @param {boolean} [options.renderBackdrop=true]
 * Whether to render the dimmed backdrop.
 * @param {boolean} [options.closeOnBackdrop=true]
 * Close when the backdrop is clicked.
 * @param {boolean} [options.closeOnEscape=true]
 * Close when Escape is pressed (top modal only).
 * @param {boolean} [options.lockScroll=true]
 * Lock document scrolling while open.
 * @param {boolean} [options.focusTrap=true]
 * Trap Tab / Shift+Tab focus inside the dialog panel.
 * @param {number|string} [options.zIndex]
 * Inline z-index on the overlay host (overrides the default 9999).
 * @param {string} [options.className]
 * Extra class name(s) applied to the overlay host element.
 *
 * @returns {Promise<any>}
 */
export function openModal(render, options = {}) {
	injectOverlayStyles();

	return new Promise((resolve) => {
		const config = {
			renderBackdrop: true,
			closeOnBackdrop: true,
			closeOnEscape: true,
			lockScroll: true,
			focusTrap: true,
			zIndex: undefined,
			className: undefined,
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

		modalStack.push(modal);

		/**
		 * Close helper exposed to modal content.
		 */
		const close = (result = false) => {
			closeModal(modal, result);
		};

		modal.close = close;

		/**
		 * Build host attribute string for optional className.
		 */
		const hostClassAttr =
			typeof config.className === "string" && config.className !== ""
				? ` class="${config.className}"`
				: "";

		/**
		 * Modal template.
		 */
		const modalTemplate = () => {
			const content = render(close);

			return `
				<div udodi-overlay-host${hostClassAttr}>
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
		 */
		const ModalRoot = () => ({
			template: modalTemplate(),

			onMount(rootElement, ctx) {
				const host =
					rootElement.querySelector("[udodi-overlay-host]") ||
					(rootElement.hasAttribute?.("udodi-overlay-host")
						? rootElement
						: rootElement.firstElementChild);

				/**
				 * Apply per-modal z-index when provided.
				 */
				if (config.zIndex != null && host) {
					host.style.zIndex = String(config.zIndex);
				}

				const backdropHandler = (event) => {
					if (!config.renderBackdrop) return;

					if (!config.closeOnBackdrop) return;

					const backdrop = event.target.closest("[udodi-overlay-backdrop]");

					if (!backdrop) return;

					close(false);
				};

				rootElement.addEventListener("click", backdropHandler);

				const layer = rootElement.querySelector("[udodi-overlay-layer]");

				/**
				 * Focus overlay layer for accessibility, then install trap.
				 */
				let removeFocusTrap = null;

				queueMicrotask(() => {
					layer?.focus?.();

					if (config.focusTrap && layer) {
						removeFocusTrap = installFocusTrap(layer, modal);
					}
				});

				ctx.cleanup(() => {
					rootElement.removeEventListener("click", backdropHandler);
					removeFocusTrap?.();
				});
			},
		});

		modal.instance = mount(ModalRoot(), root);
	});
}
