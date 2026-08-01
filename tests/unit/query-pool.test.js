import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Local-only Query Pool tests.
 *
 * Worker / module execution is covered in a separate suite that
 * can run in a real browser (or a dedicated worker harness).
 */

vi.mock("../../packages/query/reactivity/index.js", () => ({
	reactive(value) {
		return value;
	},
}));

vi.mock("../../packages/query/registry.js", () => ({
	createQueryModuleRegistry() {
		return {
			register() {
				return undefined;
			},
			registerAll() {
				return undefined;
			},
			get() {
				return null;
			},
			remove() {
				return false;
			},
		};
	},
}));

vi.mock("../../packages/query/worker-bridge.js", () => ({
	createQueryPoolWorkerBridge() {
		return {
			execute() {
				throw new Error(
					"[test] Worker bridge must not be used in local-only tests.",
				);
			},
			terminate() {},
		};
	},
}));

import { createQueryPool } from "udodi";

const nextMicrotask = () => Promise.resolve();

const delay = (ms = 0) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

describe("query pool (local)", () => {
	/** @type {ReturnType<typeof createQueryPool> | null} */
	let pool = null;

	afterEach(() => {
		pool?.terminate();
		pool = null;
	});

	function createPool() {
		pool = createQueryPool();
		return pool;
	}

	describe("query registration and basic execution", () => {
		it("runs a local source and exposes reactive status fields", async () => {
			const p = createPool();
			const users = p.query("users", {
				source: async () => [{ id: 1, name: "Ada" }],
			});

			// Registration starts an automatic execution plan.
			expect(["loading", "success"]).toContain(users.status);

			await p.refresh("users");

			expect(users.status).toBe("success");
			expect(users.loading).toBe(false);
			expect(users.error).toBeNull();
			expect(users.data).toEqual([{ id: 1, name: "Ada" }]);
			expect(p.data("users")).toEqual([{ id: 1, name: "Ada" }]);
			expect(p.has("users")).toBe(true);
			expect(p.get("users")).toBe(users);
		});

		it("applies compute after source", async () => {
			const p = createPool();
			const summary = p.query("summary", {
				source: async () => [1, 2, 3],
				compute: (list) => ({ count: list.length, sum: list.reduce((a, b) => a + b, 0) }),
			});

			await p.refresh("summary");

			expect(summary.data).toEqual({ count: 3, sum: 6 });
		});

		it("rejects invalid definitions", () => {
			const p = createPool();

			expect(() => p.query("", { source: async () => 1 })).toThrow(
				/non-empty string/,
			);
			expect(() => p.query("bad", {})).toThrow(/source function or a registered module/);
			expect(() =>
				p.query("badCompute", {
					source: async () => 1,
					compute: "nope",
				}),
			).toThrow(/compute must be a function/);
		});

		it("returns the same handle when registering the same key twice", () => {
			const p = createPool();
			const a = p.query("once", { source: async () => 1 });
			const b = p.query("once", { source: async () => 2 });
			expect(a).toBe(b);
		});
	});

	describe("errors and cancellation", () => {
		it("sets status to error when source throws", async () => {
			const p = createPool();
			const failing = p.query("failing", {
				source: async () => {
					throw new Error("boom");
				},
			});

			await expect(p.refresh("failing")).rejects.toThrow("boom");
			expect(failing.status).toBe("error");
			expect(failing.loading).toBe(false);
			expect(failing.error).toBeInstanceOf(Error);
			expect(failing.error.message).toBe("boom");
		});

		it("keeps previous data when a later refresh fails", async () => {
			const p = createPool();
			let shouldFail = false;

			const q = p.query("flaky", {
				source: async () => {
					if (shouldFail) {
						throw new Error("network");
					}
					return "ok";
				},
			});

			await p.refresh("flaky");
			expect(q.data).toBe("ok");
			expect(q.status).toBe("success");

			shouldFail = true;
			await expect(p.refresh("flaky")).rejects.toThrow("network");

			expect(q.data).toBe("ok");
			expect(q.status).toBe("error");
			expect(q.error.message).toBe("network");
		});

		it("cancels an in-flight query and rejects with AbortError", async () => {
			const p = createPool();
			let release;

			const blocked = new Promise((resolve) => {
				release = resolve;
			});

			const q = p.query("slow", {
				source: async (signal) => {
					await blocked;
					if (signal.aborted) {
						throw new DOMException(
							"Query execution was aborted.",
							"AbortError",
						);
					}
					return "done";
				},
			});

			const pending = p.refresh("slow");
			expect(q.status).toBe("loading");

			q.cancel();
			release();

			await expect(pending).rejects.toMatchObject({ name: "AbortError" });
			expect(q.status).toBe("cancelled");
			expect(q.loading).toBe(false);
		});

		it("supersedes an in-flight refresh with force and aborts the previous run", async () => {
			const p = createPool();
			let calls = 0;

			const q = p.query("race", {
				source: async () => {
					calls += 1;
					const current = calls;
					await delay(20);
					return current;
				},
			});

			const first = p.refresh("race");
			await delay(5);
			const second = p.refresh("race", { force: true });

			await expect(first).rejects.toMatchObject({ name: "AbortError" });
			await expect(second).resolves.toBe(2);
			expect(q.data).toBe(2);
			expect(q.status).toBe("success");
		});
	});

	describe("cache", () => {
		it("returns cached data while ttl is fresh", async () => {
			const p = createPool();
			let runs = 0;

			const q = p.query("cached", {
				source: async () => {
					runs += 1;
					return runs;
				},
				cache: { ttl: 60_000 },
			});

			await p.refresh("cached");
			expect(q.data).toBe(1);
			expect(runs).toBe(1);

			await p.refresh("cached");
			expect(q.data).toBe(1);
			expect(runs).toBe(1);
		});

		it("refetches after invalidate even when ttl remains", async () => {
			const p = createPool();
			let runs = 0;

			const q = p.query("staleable", {
				source: async () => {
					runs += 1;
					return runs;
				},
				cache: { ttl: 60_000 },
			});

			await p.refresh("staleable");
			expect(runs).toBe(1);

			q.invalidate();
			await p.refresh("staleable");
			expect(q.data).toBe(2);
			expect(runs).toBe(2);
		});

		it("reset clears data, cache, and status", async () => {
			const p = createPool();
			const q = p.query("resetme", {
				source: async () => "value",
				cache: { ttl: 60_000 },
			});

			await p.refresh("resetme");
			q.reset();

			expect(q.data).toBeUndefined();
			expect(q.status).toBe("idle");
			expect(q.error).toBeNull();
			expect(q.loading).toBe(false);
		});
	});

	describe("dependsOn", () => {
		it("executes dependencies before the dependent query", async () => {
			const p = createPool();
			const order = [];

			p.query("users", {
				source: async () => {
					order.push("users");
					return [{ id: 1 }];
				},
			});

			p.query("posts", {
				source: async () => {
					order.push("posts");
					return [{ id: 10 }];
				},
				dependsOn: ["users"],
			});

			// Wait for automatic initial plans, then force a clean ordered run.
			await delay(20);
			order.length = 0;

			await p.refresh("posts", { force: true });

			expect(order).toEqual(["users", "posts"]);
			expect(p.data("users")).toEqual([{ id: 1 }]);
			expect(p.data("posts")).toEqual([{ id: 10 }]);
		});

		it("runs independent dependencies in parallel", async () => {
			const p = createPool();
			const started = [];

			p.query("a", {
				source: async () => {
					started.push("a");
					await delay(30);
					return "a";
				},
			});

			p.query("b", {
				source: async () => {
					started.push("b");
					await delay(30);
					return "b";
				},
			});

			p.query("root", {
				source: async () => {
					started.push("root");
					return "root";
				},
				dependsOn: ["a", "b"],
			});

			await delay(80);
			started.length = 0;

			const t0 = Date.now();
			await p.refresh("root", { force: true });
			const elapsed = Date.now() - t0;

			expect(started.slice(0, 2).sort()).toEqual(["a", "b"]);
			expect(started[2]).toBe("root");
			// Parallel: ~30ms, not ~60ms
			expect(elapsed).toBeLessThan(55);
		});

		it("rejects circular dependencies", async () => {
			const p = createPool();

			p.query("x", {
				source: async () => 1,
				dependsOn: ["y"],
			});

			p.query("y", {
				source: async () => 2,
				dependsOn: ["x"],
			});

			await expect(p.refresh("x")).rejects.toThrow(/Circular dependency/);
		});

		it("wraps dependency failures in QueryDependencyError semantics", async () => {
			const p = createPool();

			p.query("auth", {
				source: async () => {
					throw new Error("unauthorized");
				},
			});

			p.query("profile", {
				source: async () => ({ name: "Ada" }),
				dependsOn: ["auth"],
			});

			await expect(p.refresh("profile")).rejects.toMatchObject({
				name: "QueryDependencyError",
				queryKey: "auth",
			});
		});

		it("refresh with dependents schedules reverse dependents", async () => {
			const p = createPool();
			let userRuns = 0;
			let postRuns = 0;

			p.query("users", {
				source: async () => {
					userRuns += 1;
					return userRuns;
				},
			});

			p.query("posts", {
				source: async () => {
					postRuns += 1;
					return postRuns;
				},
				dependsOn: ["users"],
			});

			await p.refresh("posts");
			const usersAfterInit = userRuns;
			const postsAfterInit = postRuns;
			expect(usersAfterInit).toBeGreaterThanOrEqual(1);
			expect(postsAfterInit).toBeGreaterThanOrEqual(1);

			await p.refresh("users", { dependents: true });
			await delay(20);

			expect(userRuns).toBeGreaterThan(usersAfterInit);
			expect(postRuns).toBeGreaterThan(postsAfterInit);
		});
	});

	describe("fetch", () => {
		it("passes input to source and caches structured-clone input for refresh", async () => {
			const p = createPool();
			const seen = [];

			const detail = p.query("userDetail", {
				source: async (_signal, input) => {
					seen.push(input);
					return { id: input?.id, name: `User ${input?.id}` };
				},
			});

			// Auto-init may run once with no input.
			await delay(10);
			seen.length = 0;

			await detail.fetch({ input: { id: 7 } });
			expect(detail.data).toEqual({ id: 7, name: "User 7" });
			expect(seen).toEqual([{ id: 7 }]);

			await detail.refresh();
			expect(seen).toEqual([{ id: 7 }, { id: 7 }]);
		});

		it("does not run dependsOn unless dependencies is true", async () => {
			const p = createPool();
			let usersRan = 0;

			p.query("users", {
				source: async () => {
					usersRan += 1;
					return [];
				},
			});

			const posts = p.query("posts", {
				source: async () => ["p1"],
				dependsOn: ["users"],
			});

			// Let auto-init settle; posts' plan may have loaded users once.
			await delay(20);
			const usersBeforeFetch = usersRan;

			await posts.fetch({ input: { page: 1 } });
			expect(posts.data).toEqual(["p1"]);
			// Plain fetch must not trigger another users run.
			expect(usersRan).toBe(usersBeforeFetch);
		});

		it("runs upstream dependsOn when dependencies is true", async () => {
			const p = createPool();
			const order = [];

			p.query("users", {
				source: async () => {
					order.push("users");
					return [{ id: 1 }];
				},
			});

			const posts = p.query("posts", {
				source: async (_signal, input) => {
					order.push(`posts:${input.page}`);
					return [`page-${input.page}`];
				},
				dependsOn: ["users"],
			});

			await posts.fetch({ input: { page: 2 }, dependencies: true });

			expect(order).toEqual(["users", "posts:2"]);
			expect(posts.data).toEqual(["page-2"]);
			expect(p.data("users")).toEqual([{ id: 1 }]);
		});

		it("schedules dependents after a successful fetch", async () => {
			const p = createPool();
			let childRuns = 0;

			const parent = p.query("parent", {
				source: async (_signal, input) => input?.value ?? 0,
			});

			p.query("child", {
				source: async () => {
					childRuns += 1;
					return p.data("parent");
				},
				dependsOn: ["parent"],
			});

			await parent.fetch({ input: { value: 42 } });
			await delay(10);

			expect(childRuns).toBeGreaterThanOrEqual(1);
			expect(p.data("child")).toBe(42);
		});
	});

	describe("mutations (local)", () => {
		it("runs execute and updates status fields", async () => {
			const p = createPool();
			const save = p.mutation("save", {
				async execute(input) {
					return { saved: input.id };
				},
			});

			expect(save.status).toBe("idle");

			const result = await save.mutate({ id: 3 });

			expect(result).toEqual({ saved: 3 });
			expect(save.data).toEqual({ saved: 3 });
			expect(save.variables).toEqual({ id: 3 });
			expect(save.status).toBe("success");
			expect(save.loading).toBe(false);
			expect(save.error).toBeNull();
			expect(p.hasMutation("save")).toBe(true);
			expect(p.getMutation("save")).toBe(save);
		});

		it("invalidates and refreshes listed queries after success", async () => {
			const p = createPool();
			let userRuns = 0;

			p.query("users", {
				source: async () => {
					userRuns += 1;
					return userRuns;
				},
			});

			await p.refresh("users");
			const baseline = userRuns;
			expect(baseline).toBeGreaterThanOrEqual(1);

			const save = p.mutation("saveUser", {
				async execute() {
					return true;
				},
				invalidates: ["users"],
			});

			await save.mutate({});
			expect(userRuns).toBe(baseline + 1);
			expect(p.data("users")).toBe(userRuns);
		});

		it("supports dependents on invalidates entries", async () => {
			const p = createPool();
			let userRuns = 0;
			let postRuns = 0;

			p.query("users", {
				source: async () => {
					userRuns += 1;
					return userRuns;
				},
			});

			p.query("posts", {
				source: async () => {
					postRuns += 1;
					return postRuns;
				},
				dependsOn: ["users"],
			});

			await p.refresh("posts");
			const usersBaseline = userRuns;
			const postsBaseline = postRuns;

			const save = p.mutation("save", {
				async execute() {
					return true;
				},
				invalidates: [{ key: "users", dependents: true }],
			});

			await save.mutate({});
			await delay(20);

			expect(userRuns).toBeGreaterThan(usersBaseline);
			expect(postRuns).toBeGreaterThan(postsBaseline);
		});

		it("runs onMutate optimistically and rolls back in onError", async () => {
			const p = createPool();

			p.query("users", {
				source: async () => [{ id: 1, name: "Ada" }],
			});
			await p.refresh("users");

			const save = p.mutation("rename", {
				async execute() {
					throw new Error("write failed");
				},
				async onMutate(input, ctx) {
					const previous = ctx.getQueryData("users");
					ctx.setQueryData("users", (users) =>
						users.map((u) =>
							u.id === input.id ? { ...u, name: input.name } : u,
						),
					);
					return { previous };
				},
				onError(_error, _input, ctx) {
					ctx.setQueryData("users", ctx.previous);
				},
			});

			await expect(
				save.mutate({ id: 1, name: "Grace" }),
			).rejects.toThrow("write failed");

			expect(p.data("users")).toEqual([{ id: 1, name: "Ada" }]);
			expect(save.status).toBe("error");
		});

		it("calls onSuccess before invalidations", async () => {
			const p = createPool();
			const events = [];

			p.query("users", {
				source: async () => {
					events.push("refresh");
					return [];
				},
			});

			// Ignore automatic initial load noise.
			await delay(10);
			events.length = 0;

			const save = p.mutation("save", {
				async execute() {
					events.push("execute");
					return true;
				},
				async onSuccess() {
					events.push("onSuccess");
				},
				invalidates: ["users"],
			});

			await save.mutate({});
			expect(events).toEqual(["execute", "onSuccess", "refresh"]);
		});

		it("cancels an in-flight mutation", async () => {
			const p = createPool();
			let release;

			const blocked = new Promise((resolve) => {
				release = resolve;
			});

			const save = p.mutation("slowSave", {
				async execute(_input, { signal }) {
					await blocked;
					if (signal.aborted) {
						throw new DOMException(
							"Mutation execution was aborted.",
							"AbortError",
						);
					}
					return "saved";
				},
			});

			const pending = save.mutate({ id: 1 });
			expect(save.status).toBe("loading");

			save.cancel();
			release();

			await expect(pending).rejects.toMatchObject({ name: "AbortError" });
			expect(save.status).toBe("cancelled");
		});

		it("supersedes a previous mutate with a newer one", async () => {
			const p = createPool();
			let calls = 0;

			const save = p.mutation("raceSave", {
				async execute() {
					calls += 1;
					const current = calls;
					await delay(20);
					return current;
				},
			});

			const first = save.mutate({ n: 1 });
			await delay(5);
			const second = save.mutate({ n: 2 });

			await expect(first).rejects.toMatchObject({ name: "AbortError" });
			await expect(second).resolves.toBe(2);
			expect(save.data).toBe(2);
			expect(save.status).toBe("success");
		});

		it("streams chunks from local execute when stream is enabled", async () => {
			const p = createPool();
			const exportJob = p.mutation("exportJob", {
				stream: true,
				async execute(_input, { stream, endStream }) {
					stream({ percent: 50 });
					stream({ percent: 100 });
					endStream();
					return { ok: true };
				},
			});

			const result = await exportJob.mutate({});

			expect(result).toEqual({ ok: true });
			expect(exportJob.streamed).toBe(true);
			expect(exportJob.streaming).toBe(false);
			expect(exportJob.chunks).toEqual([
				{ percent: 50 },
				{ percent: 100 },
			]);
			expect(exportJob.status).toBe("success");
		});

		it("rejects invalid mutation definitions", () => {
			const p = createPool();

			expect(() => p.mutation("bad", {})).toThrow(
				/execute function or a registered module/,
			);
			expect(() =>
				p.mutation("badInvalidates", {
					async execute() {},
					invalidates: "users",
				}),
			).toThrow(/invalidates must be an array/);
		});

		it("skipInvalidation leaves queries untouched", async () => {
			const p = createPool();
			let runs = 0;

			p.query("users", {
				source: async () => {
					runs += 1;
					return runs;
				},
			});
			await p.refresh("users");
			const baseline = runs;

			const save = p.mutation("save", {
				async execute() {
					return true;
				},
				invalidates: ["users"],
			});

			await save.mutate({}, { skipInvalidation: true });
			expect(runs).toBe(baseline);
		});
	});

	describe("setQueryData", () => {
		it("updates query data without running source", async () => {
			const p = createPool();

			p.query("users", {
				source: async () => [{ id: 1, name: "Ada" }],
			});
			await p.refresh("users");

			expect(p.setQueryData("users", (users) => [...users, { id: 2, name: "Grace" }])).toBe(
				true,
			);
			expect(p.data("users")).toEqual([
				{ id: 1, name: "Ada" },
				{ id: 2, name: "Grace" },
			]);

			expect(p.setQueryData("missing", [])).toBe(false);
		});
	});
});
