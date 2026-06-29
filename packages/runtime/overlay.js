import { mount } from "./mount.js";

const OVERLAY_ID = "udodi-overlay-root";

let overlayRoot = null;

let stylesInjected = false;

/**
 * Inject minimal runtime overlay CSS.
 * Only structural/runtime CSS is injected.
 * No opinionated visual styling beyond the backdrop.
 */
function injectOverlayStyles() {
	if (stylesInjected) return;

	stylesInjected = true;

	const style = document.createElement("style");

	style.setAttribute("data-udodi-overlay-styles", "");

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
function ensureOverlayRoot() {
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
export function closeModal(modal, result = false) {
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
 * @param {object} options
 * Overlay configuration.
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
		 * Modal template.
		 */
		const modalTemplate = () => {
			const content = render(close);

			return `
				<div udodi-overlay-host>
					${
						config.renderBackdrop
							? `<div udodi-overlay-backdrop></div>`
							: ""
					}

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
				const backdropHandler = (event) => {
					if (!config.renderBackdrop) return;

					if (!config.closeOnBackdrop) return;

					const backdrop = event.target.closest(
						"[udodi-overlay-backdrop]"
					);

					if (!backdrop) return;

					close(false);
				};

				rootElement.addEventListener("click", backdropHandler);

				/**
				 * Focus overlay layer for accessibility.
				 */
				queueMicrotask(() => {
					const layer = rootElement.querySelector(
						"[udodi-overlay-layer]"
					);

					layer?.focus?.();
				});

				ctx.cleanup(() => {
					rootElement.removeEventListener(
						"click",
						backdropHandler
					);
				});
			},
		});

		modal.instance = mount(ModalRoot(), root);
	});
}