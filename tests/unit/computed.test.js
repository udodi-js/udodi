import { describe, expect, it } from "vitest";
import { computed, effect, reactive } from "udodi";

describe("computed", () => {
	it("updates subscribed effects when dependencies change", async () => {
		const state = reactive({ count: 1 });
		const doubled = computed(() => state.count * 2);
		const seen = [];

		effect(() => {
			seen.push(doubled());
		});

		state.count = 2;
		await Promise.resolve();

		expect(seen).toEqual([2, 4]);
	});

	it("does not recompute until first read", () => {
		const state = reactive({ count: 1 });
		let calls = 0;

		const doubled = computed(() => {
			calls++;
			return state.count * 2;
		});

		expect(calls).toBe(0);
		expect(doubled()).toBe(2);
		expect(calls).toBe(1);
	});

	it("stops tracking dependencies when its scope is cleaned", async () => {
		const state = reactive({ count: 1 });
		const scope = { effects: [], cleanups: [] };
		let calls = 0;

		const doubled = computed(() => {
			calls++;
			return state.count * 2;
		}, scope);

		expect(doubled()).toBe(2);
		expect(calls).toBe(1);

		for (const cleanup of scope.effects) {
			cleanup();
		}

		state.count = 2;
		await Promise.resolve();

		expect(calls).toBe(1);
	});
});
