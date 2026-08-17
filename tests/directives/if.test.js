/**
 * @if Directive Test Suite
 *
 * Verifies the runtime behavior of the @if directive as implemented in
 * packages/core/bindDOM.js (processIfDirective).
 *
 * Behavior under test:
 * - Truthy expression  -> element is present in the DOM
 * - Falsy expression   -> element is replaced by an "@if" comment placeholder
 * - Reactive toggling  -> state changes mount/unmount the element live
 * - Errors in the expression are caught and treated as falsy
 * - The "@if" attribute is stripped once processed
 */

import { describe, it, expect, vi } from "vitest";
import { render, createComponent, css } from "udodi";

// Reactive updates are scheduled on a microtask queue.
function flushMicrotasks() {
	return Promise.resolve();
}

function mountToDOM(component) {
	const root = document.createElement("div");
	const instance = render(component(), root);

	return {
		root,
		instance,
		context: instance.context,
	};
}

describe("@if directive", () => {
	it("renders the element when the expression is truthy", () => {
		const Component = createComponent({
			state() {
				return {
					visible: true,
				};
			},

			template: () => `
				<div>
					<p @if="visible" data-testid="target">Hello</p>
				</div>
			`,
		});

		const { root } = mountToDOM(Component);

		expect(
			root.querySelector('[data-testid="target"]')
		).not.toBeNull();
	});

	it("does not render the element when the expression is falsy", () => {
		const Component = createComponent({
			state() {
				return {
					visible: false,
				};
			},

			template: () => `
				<div>
					<p @if="visible" data-testid="target">Hello</p>
				</div>
			`,
		});

		const { root } = mountToDOM(Component);

		expect(
			root.querySelector('[data-testid="target"]')
		).toBeNull();
	});

	it("leaves a comment placeholder in place of a falsy element", () => {
		const Component = createComponent({
			state() {
				return {
					visible: false,
				};
			},

			template: () => `
				<div>
					<p @if="visible" data-testid="target">Hello</p>
				</div>
			`,
		});

		const { root } = mountToDOM(Component);
		const container = root.querySelector("div");

		const hasIfComment = Array.from(container.childNodes).some(
			(node) =>
				node.nodeType === Node.COMMENT_NODE &&
				node.data === "@if"
		);

		expect(hasIfComment).toBe(true);
	});

	it("re-inserts the element when state becomes truthy again", async () => {
		const Component = createComponent({
			state() {
				return {
					visible: false,
				};
			},

			methods: {
				show() {
					this.visible = true;
				},
			},

			template: () => `
				<div>
					<p @if="visible" data-testid="target">Hello</p>
				</div>
			`,
		});

		const { root, context } = mountToDOM(Component);

		expect(
			root.querySelector('[data-testid="target"]')
		).toBeNull();

		context.show();

		await flushMicrotasks();

		expect(
			root.querySelector('[data-testid="target"]')
		).not.toBeNull();
	});

	it("supports toggling without leaving duplicate nodes", async () => {
		const Component = createComponent({
			state() {
				return {
					visible: true,
				};
			},

			methods: {
				show() {
					this.visible = true;
				},

				hide() {
					this.visible = false;
				},
			},

			template: () => `
				<div>
					<p @if="visible" data-testid="target">Hello</p>
				</div>
			`,
		});

		const { root, context } = mountToDOM(Component);

		expect(
			root.querySelectorAll('[data-testid="target"]').length
		).toBe(1);

		context.hide();
		await flushMicrotasks();

		expect(
			root.querySelectorAll('[data-testid="target"]').length
		).toBe(0);

		context.show();
		await flushMicrotasks();

		expect(
			root.querySelectorAll('[data-testid="target"]').length
		).toBe(1);

		context.hide();
		await flushMicrotasks();

		expect(
			root.querySelectorAll('[data-testid="target"]').length
		).toBe(0);
	});

	it("evaluates dotted path expressions against nested-ish state", () => {
		const Component = createComponent({
			state() {
				return {
					user: {
						isAdmin: true,
					},
				};
			},

			template: () => `
				<div>
					<p @if="user.isAdmin" data-testid="target">Admin</p>
				</div>
			`,
		});

		const { root } = mountToDOM(Component);

		expect(
			root.querySelector('[data-testid="target"]')
		).not.toBeNull();
	});

	it("treats a throwing state value as falsy and warns", () => {
		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		const Component = createComponent({
			state() {
				return {
					broken: () => {
						throw new Error("boom");
					},
				};
			},

			template: () => `
				<div>
					<p @if="broken" data-testid="target">Hello</p>
				</div>
			`,
		});

		const { root } = mountToDOM(Component);

		expect(
			root.querySelector('[data-testid="target"]')
		).toBeNull();

		expect(warnSpy).toHaveBeenCalled();

		warnSpy.mockRestore();
	});

	it("treats a missing/undefined path as falsy without warning", () => {
		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		const Component = createComponent({
			state() {
				return {};
			},

			template: () => `
				<div>
					<p @if="missing.deeply.nested" data-testid="target">Hello</p>
				</div>
			`,
		});

		const { root } = mountToDOM(Component);

		expect(
			root.querySelector('[data-testid="target"]')
		).toBeNull();

		expect(warnSpy).not.toHaveBeenCalled();

		warnSpy.mockRestore();
	});

	it("removes the @if attribute from the element once processed", () => {
		const Component = createComponent({
			state() {
				return {
					visible: true,
				};
			},

			template: () => `
				<div>
					<p @if="visible" data-testid="target">Hello</p>
				</div>
			`,
		});

		const { root } = mountToDOM(Component);
		const target = root.querySelector('[data-testid="target"]');

		expect(target.hasAttribute("@if")).toBe(false);
	});

	it("creates isolated state per component instance", async () => {
		const Component = createComponent({
			state() {
				return {
					visible: true,
				};
			},

			methods: {
				hide() {
					this.visible = false;
				},
			},

			template: () => `
				<div>
					<p @if="visible" data-testid="target">Hello</p>
				</div>
			`,
		});

		const firstRoot = document.createElement("div");
		const secondRoot = document.createElement("div");

		const first = render(Component(), firstRoot);
		const second = render(Component(), secondRoot);

		first.context.hide();

		await flushMicrotasks();

		expect(
			firstRoot.querySelector('[data-testid="target"]')
		).toBeNull();

		expect(
			secondRoot.querySelector('[data-testid="target"]')
		).not.toBeNull();
	});

	it("binds ordinary directives on the active @if root", () => {
		const Component = createComponent({
			state() {
				return {
					visible: true,
					activeClass: "active",
					title: "Demo panel",
				};
			},

			template: () => `
				<div>
					<section
						@if="visible"
						@class="activeClass"
						@style="'color:red'"
						@attr="title=title"
						data-testid="target"
					></section>
				</div>
			`,
		});

		const { root } = mountToDOM(Component);
		const target = root.querySelector('[data-testid="target"]');

		expect(target.classList.contains("active")).toBe(true);
		expect(target.style.color).toBe("red");
		expect(target.getAttribute("title")).toBe("Demo panel");
		expect(target.hasAttribute("@class")).toBe(false);
		expect(target.hasAttribute("@style")).toBe(false);
		expect(target.hasAttribute("@attr")).toBe(false);
	});

	it("binds nested directives only when the branch is active", async () => {
		const Component = createComponent({
			state() {
				return {
					visible: true,
					draft: "Ada",
					status: "idle",
				};
			},

			methods: {
				save() {
					this.status = this.draft;
				},
			},

			template: () => `
				<div>
					<form @if="visible">
						<input @bind="draft" data-testid="name" />
						<button type="button" @on="click=save" data-testid="save">
							Save
						</button>
						<span @text="status" data-testid="status"></span>
					</form>
				</div>
			`,
		});

		const { root, context } = mountToDOM(Component);
		const input = root.querySelector('[data-testid="name"]');
		const button = root.querySelector('[data-testid="save"]');

		expect(input.value).toBe("Ada");

		input.value = "Grace";
		input.dispatchEvent(new Event("input"));
		await flushMicrotasks();

		button.click();
		await flushMicrotasks();

		expect(context.draft).toBe("Grace");
		expect(root.querySelector('[data-testid="status"]').textContent).toBe("Grace");
	});

	it("creates a fresh branch element on repeated activation", async () => {
		const Component = createComponent({
			state() {
				return {
					visible: true,
				};
			},

			methods: {
				show() {
					this.visible = true;
				},

				hide() {
					this.visible = false;
				},
			},

			template: () => `
				<div>
					<p @if="visible" data-testid="target">Hello</p>
				</div>
			`,
		});

		const { root, context } = mountToDOM(Component);
		const first = root.querySelector('[data-testid="target"]');

		context.hide();
		await flushMicrotasks();

		context.show();
		await flushMicrotasks();

		const second = root.querySelector('[data-testid="target"]');

		expect(second).not.toBe(first);
	});

	it("supports @elseif and @else first-match semantics", async () => {
		const Component = createComponent({
			state() {
				return {
					loading: true,
					error: true,
				};
			},

			methods: {
				ready() {
					this.loading = false;
					this.error = false;
				},
			},

			template: () => `
				<div>
					<p @if="loading" data-testid="state">Loading</p>
					<p @elseif="error" data-testid="state">Error</p>
					<p @else data-testid="state">Ready</p>
				</div>
			`,
		});

		const { root, context } = mountToDOM(Component);

		expect(root.querySelector('[data-testid="state"]').textContent).toBe("Loading");

		context.ready();
		await flushMicrotasks();

		expect(root.querySelector('[data-testid="state"]').textContent).toBe("Ready");
	});

	it("mounts nested components as fresh instances when reactivated", async () => {
		let mountCount = 0;
		let unmountCount = 0;

		const Child = createComponent({
			template: () => `<span data-testid="child">Child</span>`,

			onMount() {
				mountCount++;
			},

			onUnmount() {
				unmountCount++;
			},
		});

		const Parent = createComponent({
			state() {
				return {
					visible: false,
				};
			},

			methods: {
				show() {
					this.visible = true;
				},

				hide() {
					this.visible = false;
				},
			},

			template: () => `
				<div>
					<section @if="visible">${Child()}</section>
				</div>
			`,
		});

		const root = document.createElement("div");
		document.body.appendChild(root);

		try {
			const instance = render(Parent(), root);

			expect(mountCount).toBe(0);

			instance.context.show();
			await flushMicrotasks();

			const first = root.querySelector('[data-testid="child"]');

			expect(first).not.toBeNull();
			expect(mountCount).toBe(1);

			instance.context.hide();
			await flushMicrotasks();
			await flushMicrotasks();

			expect(root.querySelector('[data-testid="child"]')).toBeNull();
			expect(unmountCount).toBe(1);

			instance.context.show();
			await flushMicrotasks();

			const second = root.querySelector('[data-testid="child"]');

			expect(second).not.toBeNull();
			expect(second).not.toBe(first);
			expect(mountCount).toBe(2);

		} finally {
			root.remove();
		}
	});

	it("renders scoped CSS for a component mounted from an initially inactive branch", async () => {
		const cssMarker = "if-lazy-child-style-marker";

		const Child = createComponent({
			style: css`
				.${cssMarker} {
					color: rgb(1, 2, 3);
				}
			`,

			template: () => `<span class="${cssMarker}" data-testid="child">Child</span>`,
		});

		const Parent = createComponent({
			state() {
				return {
					visible: false,
				};
			},

			methods: {
				show() {
					this.visible = true;
				},
			},

			template: () => `
				<div>
					<section @if="visible">${Child()}</section>
				</div>
			`,
		});

		const root = document.createElement("div");
		document.body.appendChild(root);

		try {
			const instance = render(Parent(), root);
			const styleElement = document.getElementById("udodi-styles");

			expect(styleElement?.textContent ?? "").not.toContain(cssMarker);

			instance.context.show();
			await flushMicrotasks();

			expect(root.querySelector('[data-testid="child"]')).not.toBeNull();
			expect(document.getElementById("udodi-styles").textContent).toContain(cssMarker);

		} finally {
			root.remove();
		}
	});

	// This test only works on a real browser.
	/*
	it("cleans up the element and placeholder on unmount", () => {
		const Component = createComponent({
			state() {
				return {
					visible: true,
				};
			},

			template: () => `
				<div>
					<p @if="visible" data-testid="target">Hello</p>
				</div>
			`,
		});

		const { root, instance } = mountToDOM(Component);

		instance.unmount();

		expect(
			root.querySelector('[data-testid="target"]')
		).toBeNull();

		expect(root.isConnected).toBe(false);
	});
	*/
});
