import { describe, expect, it } from "vitest";
import { createComponent, render, bindProp } from "udodi";

describe("createComponent props", () => {
	it("exposes non-colliding props on the public context", () => {
		const Message = createComponent({
			template: (ctx) => `<p>${ctx.message}</p>`,
		});

		const root = document.createElement("div");

		render(Message({ message: "Hello from props" }), root);

		expect(root.textContent).toBe("Hello from props");
	});

	it("exposes props to computed properties through the public context", () => {
		const Greeting = createComponent({
			computed: {
				greeting(ctx) {
					return `Hello, ${ctx.username}`;
				},
			},
			template: () => `<p @text="greeting"></p>`,
		});

		const root = document.createElement("div");

		render(Greeting({ username: "Ada" }), root);

		expect(root.textContent).toBe("Hello, Ada");
	});

	it("rejects props that collide with existing state keys", () => {
		const Counter = createComponent({
			state: {
				count: 0,
			},
			template: () => `<p @text="count"></p>`,
		});

		const root = document.createElement("div");

		expect(() => {
			render(Counter({ count: 10 }), root);
		}).toThrow(/conflicts/);
	});
});

describe("createComponent methods", () => {
	it("keeps methods flat on the public context", () => {
		const Profile = createComponent({
			state: {
				firstName: "Ada",
				lastName: "Lovelace",
			},
			methods: {
				getFullname() {
					return `${this.firstName} ${this.lastName}`;
				},
			},
			template: (ctx) => `<p>${ctx.getFullname()}</p>`,
		});

		const root = document.createElement("div");

		render(Profile(), root);

		expect(root.textContent).toBe("Ada Lovelace");
	});
});

describe("createComponent computed", () => {
	it("updates computed DOM bindings when state dependencies change", async () => {
		const Counter = createComponent({
			state: {
				count: 1,
			},
			computed: {
				doubled(ctx) {
					return ctx.count * 2;
				},
			},
			template: () => `<p @text="doubled"></p>`,
		});

		const root = document.createElement("div");
		const instance = render(Counter(), root);

		expect(root.textContent).toBe("2");

		instance.context.count = 2;
		await Promise.resolve();

		expect(root.textContent).toBe("4");
	});

	it("cleans computed subscriptions on unmount", async () => {
		let calls = 0;

		const Counter = createComponent({
			state: {
				count: 1,
			},
			computed: {
				doubled(ctx) {
					calls++;
					return ctx.count * 2;
				},
			},
			template: () => `<p @text="doubled"></p>`,
		});

		const root = document.createElement("div");
		const instance = render(Counter(), root);

		expect(root.textContent).toBe("2");
		expect(calls).toBe(1);

		instance.unmount();
		instance.context.count = 2;
		await Promise.resolve();

		expect(calls).toBe(1);
	});
});

describe("createComponent handlers", () => {
	it("keeps handlers flat on the internal context", async () => {
		const Counter = createComponent({
			state: {
				count: 0,
			},
			handlers: {
				increment() {
					this.count = this.count + 1;
				},
			},
			template: () => `
				<button>
					<span @text="count"></span>
				</button>
			`,
		});

		const root = document.createElement("div");

		const instance = render(Counter(), root);

		instance.context.increment(new Event("click"));
		await Promise.resolve();

		expect(root.textContent.trim()).toBe("1");
	});
});

describe("bindProp", () => {
	it("keeps child props synchronized with parent state", async () => {
		const Child = createComponent({
			template: (ctx) => `<span @text="message"></span>`
		});

		const Parent = createComponent({
			state: {
				message: "Hello"
			},

			template: (ctx) => `
				<div>
					${Child({ message: bindProp(() => ctx.message) })}
				</div>
			`,
		});

		const root = document.createElement("div");
		const instance = render(Parent(), root);

		// Initial render
		expect(root.textContent.trim()).toBe("Hello");

		// Update parent state → should propagate to child via bindProp
		instance.context.message = "Updated";

		// Wait for microtask queue (the reactivity system uses queueMicrotask)
		await Promise.resolve();

		expect(root.textContent.trim()).toBe("Updated");
	});
});

describe("bindProp", () => {
	it("does not make normal props reactive", async () => {
		const Child = createComponent({
			template: (ctx) => `<span @text="message"></span>`
		});

		const Parent = createComponent({
			state: {
				message: "Hello"
			},

			template: (ctx) => `
				<div>
					${Child({ message: ctx.message })}
				</div>
			`,
		});

		const root = document.createElement("div");
		const instance = render(Parent(), root);

		// Initial render - should show the snapshot value
		expect(root.textContent.trim()).toBe("Hello");

		// Update parent state
		instance.context.message = "Updated";

		// Wait for reactivity flush
		await Promise.resolve();

		// Child should still show the original value (static snapshot)
		expect(root.textContent.trim()).toBe("Hello");
	});
});

describe("bindProp", () => {
	it("supports binding computed values", async () => {
		const Child = createComponent({
			template: (ctx) => `<span @text="fullName"></span>`
		});

		const Parent = createComponent({
			state: {
				firstName: "Ada",
				lastName: "Lovelace"
			},

			computed: {
				fullName(ctx) {
					return `${ctx.firstName} ${ctx.lastName}`;
				}
			},

			template: (ctx) => `
				<div>
					${Child({ fullName: bindProp(() => ctx.fullName) })}
				</div>
			`,
		});

		const root = document.createElement("div");
		const instance = render(Parent(), root);

		// Initial render
		expect(root.textContent.trim()).toBe("Ada Lovelace");

		// Update state that computed depends on
		instance.context.firstName = "Grace";

		// Wait for reactivity + computed update
		await Promise.resolve();

		expect(root.textContent.trim()).toBe("Grace Lovelace");
	});
});
