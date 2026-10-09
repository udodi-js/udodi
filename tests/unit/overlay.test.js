import { afterEach, describe, expect, it } from "vitest";

import {
	closeTopModal,
	openModal,
} from "udodi";

const OVERLAY_ID = "udodi-overlay-root";
const OVERLAY_HOST = "[udodi-overlay-host]";
const OVERLAY_BACKDROP = "[udodi-overlay-backdrop]";
const OVERLAY_LAYER = "[udodi-overlay-layer]";
const OVERLAY_PANEL = "[udodi-overlay-panel]";

/**
 * Wait for the microtask used by the overlay focus initialization.
 *
 * @returns {Promise<void>}
 */
function flushMicrotask() {
	return Promise.resolve();
}

/**
 * Return the shared overlay root.
 *
 * @returns {HTMLElement|null}
 */
function getOverlayRoot() {
	return document.getElementById(OVERLAY_ID);
}

/**
 * Return all currently rendered overlay hosts.
 *
 * @returns {NodeListOf<HTMLElement>}
 */
function getOverlayHosts() {
	return document.querySelectorAll(OVERLAY_HOST);
}

/**
 * Return the top-most overlay host.
 *
 * @returns {HTMLElement|null}
 */
function getTopOverlayHost() {
	const hosts = getOverlayHosts();

	return hosts.length ? hosts[hosts.length - 1] : null;
}

/**
 * Return the top-most overlay layer.
 *
 * @returns {HTMLElement|null}
 */
function getTopOverlayLayer() {
	const host = getTopOverlayHost();

	return host?.querySelector(OVERLAY_LAYER) ?? null;
}

/**
 * Close every active modal and clean up the document between tests.
 *
 * @returns {void}
 */
function cleanupOverlays() {
	let guard = 0;

	while (getOverlayHosts().length > 0 && guard++ < 100) {
		closeTopModal();
	}

	getOverlayRoot()?.remove();

	document.body.style.overflow = "";
	document.body.className = "";
}

afterEach(() => {
	cleanupOverlays();
});

describe("overlay", () => {
	describe("overlay root", () => {
        it("creates the shared overlay root when a modal opens", async () => {
            expect(getOverlayRoot()).toBeNull();

            const promise = openModal(() => "<p>Content</p>");

            await flushMicrotask();

            const root = getOverlayRoot();

            expect(root).toBeInstanceOf(HTMLElement);
            expect(root?.id).toBe(OVERLAY_ID);
            expect(document.body.contains(root)).toBe(true);

            closeTopModal();
            await promise;
        });

        it("reuses the shared overlay root across modals", async () => {
            const firstPromise = openModal(() => "<p>First</p>");

            await flushMicrotask();

            const firstRoot = getOverlayRoot();

            const secondPromise = openModal(() => "<p>Second</p>");

            await flushMicrotask();

            const secondRoot = getOverlayRoot();

            expect(secondRoot).toBe(firstRoot);
            expect(document.querySelectorAll(`#${OVERLAY_ID}`)).toHaveLength(1);

            closeTopModal();
            await secondPromise;
            closeTopModal();
            await firstPromise;
        });

        it("recreates the root when the previous root is disconnected", async () => {
            const firstPromise = openModal(() => "<p>First</p>");

            await flushMicrotask();

            const firstRoot = getOverlayRoot();

            expect(firstRoot).not.toBeNull();

            closeTopModal();
            await firstPromise;

            // Disconnect the empty shared root from the document.
            firstRoot.remove();
            expect(getOverlayRoot()).toBeNull();

            const secondPromise = openModal(() => "<p>Second</p>");

            await flushMicrotask();

            const secondRoot = getOverlayRoot();

            expect(secondRoot).not.toBeNull();
            expect(secondRoot).not.toBe(firstRoot);
            expect(secondRoot?.id).toBe(OVERLAY_ID);
            expect(document.body.contains(secondRoot)).toBe(true);

            closeTopModal();
            await secondPromise;
        });
    });

	describe("opening", () => {
		it("renders modal content inside the overlay structure", async () => {
			const promise = openModal(() => "<p>Hello overlay</p>");

			await flushMicrotask();

			const host = getTopOverlayHost();

			expect(host).not.toBeNull();
			expect(host?.querySelector(OVERLAY_LAYER)).not.toBeNull();
			expect(host?.querySelector(OVERLAY_PANEL)).not.toBeNull();
			expect(host?.textContent).toContain("Hello overlay");

			closeTopModal();

			await expect(promise).resolves.toBe(false);
		});

		it("renders a backdrop by default", async () => {
			openModal(() => "<p>Content</p>");

			await flushMicrotask();

			expect(
				getTopOverlayHost()?.querySelector(OVERLAY_BACKDROP),
			).not.toBeNull();
		});

		it("can disable the backdrop", async () => {
			openModal(
				() => "<p>Content</p>",
				{ renderBackdrop: false },
			);

			await flushMicrotask();

			expect(
				getTopOverlayHost()?.querySelector(OVERLAY_BACKDROP),
			).toBeNull();
		});

		it("applies a custom z-index", async () => {
			openModal(
				() => "<p>Content</p>",
				{ zIndex: 20000 },
			);

			await flushMicrotask();

			expect(getTopOverlayHost()?.style.zIndex).toBe("20000");
		});

		it("applies a custom class name to the host", async () => {
			openModal(
				() => "<p>Content</p>",
				{ className: "custom-modal theme-dark" },
			);

			await flushMicrotask();

			const host = getTopOverlayHost();

			expect(host?.classList.contains("custom-modal")).toBe(true);
			expect(host?.classList.contains("theme-dark")).toBe(true);
		});

		it("does not inject duplicate overlay styles", async () => {
			openModal(() => "<p>First</p>");

			await flushMicrotask();

			const stylesBefore = document.querySelectorAll(
				"style[udodi-overlay-styles]",
			);

			openModal(() => "<p>Second</p>");

			await flushMicrotask();

			const stylesAfter = document.querySelectorAll(
				"style[udodi-overlay-styles]",
			);

			expect(stylesBefore).toHaveLength(1);
			expect(stylesAfter).toHaveLength(1);
		});
	});

    describe("closing", () => {
        it("resolves the modal promise with the close result", async () => {
            let closeModal;

            const promise = openModal((close) => {
                closeModal = close;

                return `
                    <p>Content</p>
                `;
            });

            await flushMicrotask();

            expect(closeModal).toBeTypeOf("function");

            closeModal("confirmed");

            await expect(promise).resolves.toBe("confirmed");
            expect(getOverlayHosts()).toHaveLength(0);
        });

        it("resolves with false when closed without a result", async () => {
            const promise = openModal(() => "<p>Content</p>");

            await flushMicrotask();

            closeTopModal();

            await expect(promise).resolves.toBe(false);
        });

        it("does not close the same modal twice", async () => {
            const promise = openModal(() => "<p>Content</p>");

            await flushMicrotask();

            closeTopModal("first");
            closeTopModal("second");

            await expect(promise).resolves.toBe("first");
            expect(getOverlayHosts()).toHaveLength(0);
        });

        it("unmounts the modal when it closes", async () => {
            const promise = openModal(() => "<p>Content</p>");

            await flushMicrotask();

            expect(getOverlayHosts()).toHaveLength(1);

            closeTopModal();

            await promise;

            expect(getOverlayHosts()).toHaveLength(0);
        });
    });

	describe("stacking", () => {
		it("allows multiple modals to be open at the same time", async () => {
			const first = openModal(() => "<p>First</p>");

			await flushMicrotask();

			const second = openModal(() => "<p>Second</p>");

			await flushMicrotask();

			expect(getOverlayHosts()).toHaveLength(2);
			expect(document.body.textContent).toContain("First");
			expect(document.body.textContent).toContain("Second");

			closeTopModal("second");

			await expect(second).resolves.toBe("second");

			expect(getOverlayHosts()).toHaveLength(1);

			closeTopModal("first");

			await expect(first).resolves.toBe("first");
		});

		it("closes only the top-most modal with closeTopModal", async () => {
			const first = openModal(() => "<p>First</p>");
			const second = openModal(() => "<p>Second</p>");

			await flushMicrotask();

			closeTopModal("top");

			await expect(second).resolves.toBe("top");
			expect(getOverlayHosts()).toHaveLength(1);

			closeTopModal("bottom");

			await expect(first).resolves.toBe("bottom");
			expect(getOverlayHosts()).toHaveLength(0);
		});

		it("only allows the top-most modal to consume Escape", async () => {
			const first = openModal(() => "<p>First</p>");
			const second = openModal(() => "<p>Second</p>");

			await flushMicrotask();

			document.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Escape",
					bubbles: true,
				}),
			);

			await expect(second).resolves.toBe(false);
			expect(getOverlayHosts()).toHaveLength(1);

			closeTopModal("first");

			await expect(first).resolves.toBe("first");
		});
	});

	describe("Escape", () => {
		it("closes the modal with Escape by default", async () => {
			const promise = openModal(() => "<p>Content</p>");

			await flushMicrotask();

			document.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Escape",
					bubbles: true,
				}),
			);

			await expect(promise).resolves.toBe(false);
			expect(getOverlayHosts()).toHaveLength(0);
		});

		it("does not close when closeOnEscape is false", async () => {
			const promise = openModal(
				() => "<p>Content</p>",
				{ closeOnEscape: false },
			);

			await flushMicrotask();

			document.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Escape",
					bubbles: true,
				}),
			);

			await flushMicrotask();

			expect(getOverlayHosts()).toHaveLength(1);

			closeTopModal();

			await expect(promise).resolves.toBe(false);
		});
	});

	describe("backdrop", () => {
		it("closes when the backdrop is clicked by default", async () => {
			const promise = openModal(() => "<p>Content</p>");

			await flushMicrotask();

			const backdrop = getTopOverlayHost()?.querySelector(
				OVERLAY_BACKDROP,
			);

			expect(backdrop).not.toBeNull();

			backdrop?.dispatchEvent(
				new MouseEvent("click", {
					bubbles: true,
				}),
			);

			await expect(promise).resolves.toBe(false);
			expect(getOverlayHosts()).toHaveLength(0);
		});

		it("does not close when closeOnBackdrop is false", async () => {
			const promise = openModal(
				() => "<p>Content</p>",
				{ closeOnBackdrop: false },
			);

			await flushMicrotask();

			const backdrop = getTopOverlayHost()?.querySelector(
				OVERLAY_BACKDROP,
			);

			backdrop?.dispatchEvent(
				new MouseEvent("click", {
					bubbles: true,
				}),
			);

			await flushMicrotask();

			expect(getOverlayHosts()).toHaveLength(1);

			closeTopModal();

			await expect(promise).resolves.toBe(false);
		});

		it("does not close when the modal panel is clicked", async () => {
			const promise = openModal(() => `
				<div id="content">
					<button type="button">Action</button>
				</div>
			`);

			await flushMicrotask();

			const panel = getTopOverlayHost()?.querySelector(OVERLAY_PANEL);

			expect(panel).not.toBeNull();

			panel?.dispatchEvent(
				new MouseEvent("click", {
					bubbles: true,
				}),
			);

			await flushMicrotask();

			expect(getOverlayHosts()).toHaveLength(1);

			closeTopModal();

			await expect(promise).resolves.toBe(false);
		});

		it("does not close when backdrop rendering is disabled", async () => {
			const promise = openModal(
				() => "<p>Content</p>",
				{ renderBackdrop: false },
			);

			await flushMicrotask();

			expect(
				getTopOverlayHost()?.querySelector(OVERLAY_BACKDROP),
			).toBeNull();

			closeTopModal();

			await expect(promise).resolves.toBe(false);
		});
	});

	describe("scroll locking", () => {
		it("locks document scrolling by default", async () => {
			const promise = openModal(() => "<p>Content</p>");

			await flushMicrotask();

			expect(document.body.style.overflow).toBe("hidden");

			closeTopModal();

			await promise;

			expect(document.body.style.overflow).toBe("");
		});

		it("does not lock scrolling when lockScroll is false", async () => {
			document.body.style.overflow = "auto";

			const promise = openModal(
				() => "<p>Content</p>",
				{ lockScroll: false },
			);

			await flushMicrotask();

			expect(document.body.style.overflow).toBe("auto");

			closeTopModal();

			await promise;

			expect(document.body.style.overflow).toBe("auto");
		});

		it("keeps scrolling locked while another modal owns the lock", async () => {
			const first = openModal(() => "<p>First</p>");
			const second = openModal(() => "<p>Second</p>");

			await flushMicrotask();

			expect(document.body.style.overflow).toBe("hidden");

			closeTopModal();

			await second;

			expect(document.body.style.overflow).toBe("hidden");

			closeTopModal();

			await first;

			expect(document.body.style.overflow).toBe("");
		});

		it("restores the existing body overflow value", async () => {
			document.body.style.overflow = "auto";

			const promise = openModal(() => "<p>Content</p>");

			await flushMicrotask();

			expect(document.body.style.overflow).toBe("hidden");

			closeTopModal();

			await promise;

			expect(document.body.style.overflow).toBe("auto");
		});
	});

	describe("focus", () => {
		it("focuses the overlay layer when opened", async () => {
			openModal(() => "<p>Content</p>");

			await flushMicrotask();

			const layer = getTopOverlayLayer();

			expect(layer).not.toBeNull();
			expect(document.activeElement).toBe(layer);
		});

		it("restores focus to the previously active element", async () => {
			const trigger = document.createElement("button");

			trigger.type = "button";
			trigger.textContent = "Open";

			document.body.appendChild(trigger);
			trigger.focus();

			expect(document.activeElement).toBe(trigger);

			const promise = openModal(() => "<p>Content</p>");

			await flushMicrotask();

			expect(document.activeElement).not.toBe(trigger);

			closeTopModal();

			await promise;

			expect(document.activeElement).toBe(trigger);

			trigger.remove();
		});

		it("does not trap focus when focusTrap is false", async () => {
			const promise = openModal(
				() => `
					<button id="first">First</button>
					<button id="second">Second</button>
				`,
				{ focusTrap: false },
			);

			await flushMicrotask();

			const first = document.querySelector("#first");
			const second = document.querySelector("#second");

			expect(first).not.toBeNull();
			expect(second).not.toBeNull();

			first?.focus();

			first?.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Tab",
					bubbles: true,
				}),
			);

			expect(document.activeElement).toBe(first);

			closeTopModal();

			await promise;
		});

		it("wraps Tab from the last focusable element to the first", async () => {
			const promise = openModal(() => `
				<button id="first">First</button>
				<button id="last">Last</button>
			`);

			await flushMicrotask();

			const first = document.querySelector("#first");
			const last = document.querySelector("#last");

			expect(first).not.toBeNull();
			expect(last).not.toBeNull();

			last?.focus();

			last?.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Tab",
					bubbles: true,
				}),
			);

			expect(document.activeElement).toBe(first);

			closeTopModal();

			await promise;
		});

		it("wraps Shift+Tab from the first focusable element to the last", async () => {
			const promise = openModal(() => `
				<button id="first">First</button>
				<button id="last">Last</button>
			`);

			await flushMicrotask();

			const first = document.querySelector("#first");
			const last = document.querySelector("#last");

			expect(first).not.toBeNull();
			expect(last).not.toBeNull();

			first?.focus();

			first?.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Tab",
					shiftKey: true,
					bubbles: true,
				}),
			);

			expect(document.activeElement).toBe(last);

			closeTopModal();

			await promise;
		});

		it("keeps focus on the layer when no focusable elements exist", async () => {
			const promise = openModal(() => "<p>Content only</p>");

			await flushMicrotask();

			const layer = getTopOverlayLayer();

			expect(layer).not.toBeNull();
			expect(document.activeElement).toBe(layer);

			layer?.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Tab",
					bubbles: true,
				}),
			);

			expect(document.activeElement).toBe(layer);

			closeTopModal();

			await promise;
		});

		it("wraps focus when Tab starts outside the layer", async () => {
			const outside = document.createElement("button");

			outside.type = "button";
			outside.textContent = "Outside";

			document.body.appendChild(outside);

			const promise = openModal(() => `
				<button id="first">First</button>
				<button id="last">Last</button>
			`);

			await flushMicrotask();

			const layer = getTopOverlayLayer();
			const first = document.querySelector("#first");

			expect(layer).not.toBeNull();
			expect(first).not.toBeNull();

			outside.focus();

			layer?.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Tab",
					bubbles: true,
				}),
			);

			expect(document.activeElement).toBe(first);

			closeTopModal();

			await promise;

			outside.remove();
		});
	});

	describe("cleanup", () => {
		it("removes the modal event listeners when unmounted", async () => {
			const promise = openModal(() => "<p>Content</p>");

			await flushMicrotask();

			closeTopModal();

			await promise;

			expect(getOverlayHosts()).toHaveLength(0);

			document.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Escape",
					bubbles: true,
				}),
			);

			expect(getOverlayHosts()).toHaveLength(0);
		});

		it("removes the shared root after explicit test cleanup", async () => {
			const promise = openModal(() => "<p>Content</p>");

			await flushMicrotask();

			closeTopModal();

			await promise;

			expect(getOverlayRoot()).not.toBeNull();

			cleanupOverlays();

			expect(getOverlayRoot()).toBeNull();
		});
	});
});
