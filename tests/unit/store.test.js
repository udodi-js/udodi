import { describe, expect, it, vi } from "vitest";
import {
	batch,
	createNamespace,
	defineStore,
	destroyStore,
	registerStore,
	store,
} from "udodi";

const nextMicrotask = () => Promise.resolve();

describe("store", () => {
	it("lets batched updates read staged values", () => {
		store.clear();
		store.set("count", 0);
		batch(() => {
			store.update("count", (count) => count + 1);
			store.update("count", (count) => count + 1);
			expect(store.get("count")).toBe(2);
		});
		expect(store.get("count")).toBe(2);
	});

	it("deduplicates batched subscriber updates by key", async () => {
		store.clear();
		store.set("theme", "light");
		const seen = [];
		const unsubscribe = store.subscribe("theme", (next, prev) => {
			seen.push([next, prev]);
		});
		batch(() => {
			store.set("theme", "dark");
			store.set("theme", "system");
		});
		await nextMicrotask();
		unsubscribe();
		expect(seen).toEqual([
			["light", undefined],
			["system", "light"],
		]);
	});

	it("notifies subscribers when stored arrays mutate in place", async () => {
		store.clear();
		store.set("items", []);
		let length = 0;
		const unsubscribe = store.subscribe("items", (items) => {
			length = items.length;
		});
		store.get("items").push("first");
		await nextMicrotask();
		unsubscribe();
		expect(length).toBe(1);
	});

	it("resubscribes after delete and recreate", async () => {
		store.clear();
		store.set("name", "Ada");
		const seen = [];
		const unsubscribe = store.subscribe("name", (next) => {
			seen.push(next);
		});
		store.delete("name");
		store.set("name", "Grace");
		await nextMicrotask();
		unsubscribe();
		expect(seen).toEqual(["Ada", "Grace"]);
	});

	it("warns or throws when dispatching a missing action", () => {
		store.clear();
		const warn = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});
		expect(store.dispatch("missing:action")).toBeUndefined();
		expect(warn).toHaveBeenCalledWith(
			"[store] Missing action: missing:action",
		);
		expect(() =>
			store.dispatch("missing:action", undefined, { strict: true }),
		).toThrow("[store] Missing action: missing:action");
		warn.mockRestore();
	});

	it("creates computed selectors from global store state", async () => {
		store.clear();
		store.set("price", 10);
		store.set("quantity", 2);
		const total = store.select((state) => {
			return state.get("price") * state.get("quantity");
		});
		expect(total()).toBe(20);
		store.set("quantity", 3);
		await nextMicrotask();
		expect(total()).toBe(30);
	});

	it("creates computed selectors from namespaced store state", async () => {
		store.clear();
		const session = createNamespace("session");
		session.set("firstName", "Ada");
		session.set("lastName", "Lovelace");
		const fullName = session.select((state) => {
			return `${state.get("firstName")} ${state.get("lastName")}`;
		});
		expect(fullName()).toBe("Ada Lovelace");
		session.set("lastName", "Byron");
		await nextMicrotask();
		expect(fullName()).toBe("Ada Byron");
	});

	describe("persistence", () => {
		it("persists and hydrates a store value with IndexedDB", async () => {
			store.clear();
			const dbName = `udodi-test-${Date.now()}-${Math.random()}`;
			store.set("theme", "dark");
			const persistence = store.persist("theme", { dbName });
			expect(persistence.keys).toEqual(["theme"]);
			expect(await persistence.ready).toBe(true);
			await persistence.flush();

			/**
			 * Stop the first persistence instance so the
			 * hydration test starts with no active subscriber
			 * from the previous instance.
			 */
			persistence.stop();
			store.delete("theme");
			expect(store.has("theme")).toBe(false);

			const restored = store.persist("theme", { dbName });
			expect(await restored.ready).toBe(true);
			expect(store.get("theme")).toBe("dark");
			restored.stop();
		});

		it("persists and hydrates multiple store keys", async () => {
			store.clear();
			const dbName = `udodi-test-${Date.now()}-${Math.random()}`;
			store.set("theme", "dark");
			store.set("language", "en");
			const persistence = store.persist(["theme", "language"], { dbName });
			expect(await persistence.ready).toBe(true);
			await persistence.flush();
			persistence.stop();

			store.delete("theme");
			store.delete("language");

			const restored = store.persist(["theme", "language"], { dbName });
			expect(await restored.ready).toBe(true);
			expect(store.get("theme")).toBe("dark");
			expect(store.get("language")).toBe("en");
			restored.stop();
		});

		it("persists namespaced store values", async () => {
			store.clear();
			const dbName = `udodi-test-${Date.now()}-${Math.random()}`;
			const session = createNamespace("session");
			session.set("theme", "dark");
			const persistence = session.persist("theme", { dbName });
			expect(await persistence.ready).toBe(true);
			await persistence.flush();
			persistence.stop();

			session.delete("theme");
			expect(session.has("theme")).toBe(false);

			const restored = session.persist("theme", { dbName });
			expect(await restored.ready).toBe(true);
			expect(session.get("theme")).toBe("dark");
			restored.stop();
		});

		it("persists module state through the module API", async () => {
			store.clear();
			const dbName = `udodi-test-${Date.now()}-${Math.random()}`;
			const settings = defineStore("persistentSettings", {
				state: { theme: "light" },
			});
			settings.set("theme", "dark");
			const persistence = settings.persist("theme", { dbName });
			expect(await persistence.ready).toBe(true);
			await persistence.flush();
			persistence.stop();

			settings.delete("theme");
			expect(settings.has("theme")).toBe(false);

			/**
			 * Re-registering the same module name returns
			 * the existing module, so persistence can be
			 * attached again to verify hydration.
			 */
			const restoredSettings = defineStore("persistentSettings", {
				state: {},
			});
			const restored = restoredSettings.persist("theme", { dbName });
			expect(await restored.ready).toBe(true);
			expect(restoredSettings.get("theme")).toBe("dark");
			restored.stop();
			destroyStore("persistentSettings");
		});

		it("clears persisted values without stopping persistence", async () => {
			store.clear();
			const dbName = `udodi-test-${Date.now()}-${Math.random()}`;
			store.set("theme", "dark");
			const persistence = store.persist("theme", { dbName });
			expect(await persistence.ready).toBe(true);
			await persistence.flush();
			expect(await persistence.clear()).toBe(true);
			persistence.stop();

			store.delete("theme");
			const restored = store.persist("theme", { dbName });
			expect(await restored.ready).toBe(true);

			/**
			 * Nothing should have been hydrated because
			 * the persisted value was cleared.
			 */
			expect(store.get("theme")).toBeUndefined();
			restored.stop();
		});

		it("stops persistence subscriptions", async () => {
			store.clear();
			const dbName = `udodi-test-${Date.now()}-${Math.random()}`;
			store.set("theme", "light");
			const persistence = store.persist("theme", { dbName });
			expect(await persistence.ready).toBe(true);
			persistence.stop();

			store.set("theme", "dark");
			await nextMicrotask();

			/**
			 * Create a new persistence instance.
			 * Since the previous controller was stopped
			 * before the "dark" update, only "light" should
			 * have been persisted.
			 */
			store.delete("theme");
			const restored = store.persist("theme", { dbName });
			expect(await restored.ready).toBe(true);
			expect(store.get("theme")).toBe("light");
			restored.stop();
		});
	});
});

describe("store registry", () => {
	it("tracks dynamic state keys through the module proxy", async () => {
		store.clear();
		let keys = [];
		const counter = registerStore("dynamicCounter", {
			state: { count: 0 },
			actions: {
				addLabel({ state }, label) {
					state.label = label;
					keys = Object.keys(state);
				},
			},
		});
		await counter.dispatch("addLabel", "Clicks");
		expect(counter.get("label")).toBe("Clicks");
		expect(keys).toEqual(["count", "label"]);
		destroyStore("dynamicCounter");
		expect(store.has("dynamicCounter:count")).toBe(false);
		expect(store.has("dynamicCounter:label")).toBe(false);
	});

	it("runs definition cleanup when a module is destroyed", () => {
		store.clear();
		let cleaned = false;
		registerStore("cleanupStore", {
			state: { value: 1 },
			cleanup() {
				cleaned = true;
			},
		});
		destroyStore("cleanupStore");
		expect(cleaned).toBe(true);
		expect(store.has("cleanupStore:value")).toBe(false);
	});

	it("supports defineStore state and selectors as the preferred module API", async () => {
		store.clear();
		const cart = defineStore("cart", {
			state: { items: [] },
			actions: {
				add({ state }, item) {
					state.items.push(item);
				},
			},
		});
		const count = cart.select((state) => state.items.length);
		expect(cart.state.items).toEqual([]);
		expect(count()).toBe(0);
		await cart.dispatch("add", { name: "Keyboard" });
		await nextMicrotask();
		expect(cart.state.items).toEqual([{ name: "Keyboard" }]);
		expect(count()).toBe(1);
		destroyStore("cart");
	});
});
