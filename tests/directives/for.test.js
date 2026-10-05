/**
 * @for Directive Test Suite
 *
 * Covers repeated list rendering, keyed reconciliation, root-level directive
 * binding, and nested structural branches that use `@for` and `@if` together.
 */

import { describe, it, expect, vi } from "vitest";
import { render, createComponent } from "udodi";

function flushMicrotasks() {
	return Promise.resolve();
}

function mountToDOM(component) {
	const root = document.createElement("div");
	const instance = render(component(), root);

	return { root, instance, context: instance.context };
}

describe("@for directive", () => {
	it("renders an unkeyed list from an array", () => {
		const Component = createComponent({
			state() {
				return {
					items: ["Alpha", "Bravo", "Charlie"],
				};
			},

			template: () => `
				<ul>
					<li @for="item items">
						<span @text="item"></span>
					</li>
				</ul>
			`,
		});

		const { root } = mountToDOM(Component);
		const values = Array.from(root.querySelectorAll("li")).map((node) =>
			node.textContent.trim(),
		);

		expect(values).toEqual(["Alpha", "Bravo", "Charlie"]);
	});

	it("supports the optional index variable", () => {
		const Component = createComponent({
			state() {
				return {
					items: ["A", "B"],
				};
			},

			template: () => `
				<ul>
					<li @for="item index items">
						<span @text="index"></span>
						<span @text="item"></span>
					</li>
				</ul>
			`,
		});

		const { root } = mountToDOM(Component);
		const values = Array.from(root.querySelectorAll("li")).map((node) =>
			node.textContent.replace(/\s+/g, ""),
		);

		expect(values).toEqual(["0A", "1B"]);
	});

	it("supports non-structural directives on the @for root", async () => {
		const Component = createComponent({
			state() {
				return {
					items: [
						{ id: 1, label: "First", selected: true },
						{ id: 2, label: "Second", selected: false },
					],
				};
			},

			methods: {
				isSelected(item) {
					return item.selected;
				},
			},

			template: () => `
				<ul>
					<li
						@for="item items"
						@class="isSelected:item=>'selected'"
						data-testid="item"
					>
						<span @text="item.label"></span>
					</li>
				</ul>
			`,
		});

		const { root } = mountToDOM(Component);
		const items = Array.from(root.querySelectorAll('[data-testid="item"]'));

		expect(items).toHaveLength(2);
		expect(items[0].classList.contains("selected")).toBe(true);
		expect(items[1].classList.contains("selected")).toBe(false);

		await flushMicrotasks();
	});

	it("binds @on on each @for root using the item scope", async () => {
		const Component = createComponent({
			state() {
				return {
					items: [
						{ id: 1, label: "First" },
						{ id: 2, label: "Second" },
					],
					selectedId: null,
				};
			},

			methods: {
				select(event, id) {
					this.selectedId = id;
				},
			},

			template: () => `
				<ul>
					<li
						@for="item items"
						@on="click=select:item.id"
						data-testid="item"
					>
						<span @text="item.label"></span>
					</li>
				</ul>
			`,
		});

		const { root, context } = mountToDOM(Component);
		const items = root.querySelectorAll('[data-testid="item"]');

		expect(items).toHaveLength(2);

		items[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await flushMicrotasks();

		expect(context.selectedId).toBe(2);
	});

	it("binds @text on the @for root", () => {
		const Component = createComponent({
			state() {
				return {
					items: ["Alpha", "Bravo", "Charlie"],
				};
			},

			template: () => `
				<ul>
					<li
						@for="item items"
						@text="item"
						data-testid="item"
					></li>
				</ul>
			`,
		});

		const { root } = mountToDOM(Component);
		const values = Array.from(root.querySelectorAll('[data-testid="item"]')).map(
			(node) => node.textContent,
		);

		expect(values).toEqual(["Alpha", "Bravo", "Charlie"]);
	});

	it("binds @bind on an @for root", async () => {
		const Component = createComponent({
			state() {
				return {
					items: [
						{ id: 1, label: "First" },
						{ id: 2, label: "Second" },
					],
				};
			},

			template: () => `
				<ul>
					<input
						@for="item items"
						@bind="item.label"
						data-testid="item"
					>
				</ul>
			`,
		});

		const { root } = mountToDOM(Component);
		const inputs = root.querySelectorAll('[data-testid="item"]');

		expect(inputs).toHaveLength(2);
		expect(inputs[0].value).toBe("First");
		expect(inputs[1].value).toBe("Second");

		inputs[1].value = "Updated";
		inputs[1].dispatchEvent(new Event("input", { bubbles: true }));

		await flushMicrotasks();

		expect(inputs[1].value).toBe("Updated");
	});

	it("reorders keyed items without duplicating DOM nodes", async () => {
		const Component = createComponent({
			state() {
				return {
					items: [
						{ id: 1, label: "First" },
						{ id: 2, label: "Second" },
					],
				};
			},

			methods: {
				reorder() {
					this.items = [
						{ id: 2, label: "Second" },
						{ id: 1, label: "First" },
					];
				},
			},

			template: () => `
				<ul>
					<li @for="item items" @key="item.id">
						<span @text="item.label"></span>
					</li>
				</ul>
			`,
		});

		const { root, context } = mountToDOM(Component);
		const before = Array.from(root.querySelectorAll("li")).map((node) =>
			node.textContent.replace(/\s+/g, ""),
		);

		expect(before).toEqual(["First", "Second"]);

		context.reorder();
		await flushMicrotasks();

		const after = Array.from(root.querySelectorAll("li")).map((node) =>
			node.textContent.replace(/\s+/g, ""),
		);

		expect(after).toEqual(["Second", "First"]);
		expect(root.querySelectorAll("li").length).toBe(2);
	});

	it("supports nested @if inside @for and @for inside @if", async () => {
		const Component = createComponent({
			state() {
				return {
					showList: true,
					items: [
						{ id: 1, active: true },
						{ id: 2, active: false },
					],
				};
			},

			methods: {
				toggle() {
					this.showList = !this.showList;
				},
			},

			template: () => `
				<div>
					<div @if="showList">
						<ul>
							<li @for="item items" @key="item.id">
								<span @if="item.active" data-testid="active">active</span>
								<span @else data-testid="inactive">inactive</span>
							</li>
						</ul>
					</div>
				</div>
			`,
		});

		const { root, context } = mountToDOM(Component);

		expect(root.querySelectorAll('[data-testid="active"]').length).toBe(1);
		expect(root.querySelectorAll('[data-testid="inactive"]').length).toBe(1);

		context.toggle();
		await flushMicrotasks();

		expect(root.querySelector("ul")).toBeNull();
	});

	it("ignores conflicting structural directives on the @for root", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const Component = createComponent({
			state() {
				return {
					items: ["Alpha", "Bravo"],
					show: true,
				};
			},

			template: () => `
				<ul>
					<li
						@for="item items"
						@if="show"
						@text="item"
						data-testid="item"
					></li>
				</ul>
			`,
		});

		const { root } = mountToDOM(Component);
		const items = root.querySelectorAll('[data-testid="item"]');

		expect(items).toHaveLength(2);
		expect(Array.from(items).map((node) => node.textContent)).toEqual([
			"Alpha",
			"Bravo",
		]);

		expect(warn).toHaveBeenCalled();

		warn.mockRestore();
	});
});
