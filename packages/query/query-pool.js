import { reactive } from "../reactivity/index.js";
import { createQueryModuleRegistry } from "./registry.js";
import { createQueryPoolWorkerBridge } from "./worker-bridge.js";

/**
 * Error thrown when a query cannot execute because one
 * of its dependencies failed.
 *
 * A dependency failure prevents dependent queries from
 * executing because their required data may be invalid.
 *
 * @extends Error
 */
class QueryDependencyError extends Error {
	/**
	 * Create a dependency error.
	 *
	 * @param {string} queryKey
	 * Failed dependency key.
	 *
	 * @param {Error} cause
	 * Original dependency failure.
	 */
	constructor(queryKey, cause) {
		super(
			`[query-pool] Dependency "${queryKey}" failed.`,
		);

		this.name = "QueryDependencyError";

		this.queryKey = queryKey;

		this.cause = cause;
	}
}

/**
 * Query definition.
 *
 * A query executes either locally using a source/compute pipeline
 * or remotely through a registered worker module.
 *
 * Local execution:
 *
 *     source(signal)
 *         │
 *         ▼
 *     compute(data)
 *
 * Worker module execution:
 *
 *     module.query(context)
 *
 * Worker modules execute entirely inside the Compute Worker Pool.
 *
 * Query input is supplied per execution through query.fetch().
 *
 * Worker query input uses normal structured cloning by default.
 * Transferable input transport is explicitly enabled through
 * fetch({ transfer: true }) or the query definition's transfer option.
 *
 * Dependencies declared with dependsOn execute before the query.
 * Independent dependency branches execute in parallel.
 *
 * @typedef {Object} QueryDefinition
 *
 * @property {Function} [source]
 * Local source function.
 *
 * The source receives an AbortSignal and returns the raw query data.
 *
 * @property {Function} [compute]
 * Optional local transformation function.
 *
 * When provided, compute receives the value returned by source.
 *
 * @property {string} [module]
 * Registered worker module key.
 *
 * Worker modules execute through the Main Worker and Compute Worker Pool.
 *
 * @property {any} [input]
 * Initial cached query input.
 *
 * Used for the initial execution and subsequent refresh() calls
 * until replaced by fetch({ input }) executed without transfer.
 *
 * @property {boolean} [stream]
 * Enable streaming for worker module execution.
 *
 * @property {boolean} [transfer]
 * Enable Transferable Object transport for query input by default.
 *
 * This option can be overridden for an individual execution through
 * query.fetch({ transfer }).
 *
 * Transferable input transport is disabled by default.
 *
 * @property {Object} [cache]
 * Query cache configuration.
 *
 * @property {string[]} [dependsOn]
 * Query dependencies.
 *
 * Dependencies execute before this query. Cyclic dependencies
 * are rejected when building the execution plan.
 */

/**
 * Create a Query Pool.
 *
 * Dependency execution is handled by four coordinated functions:
 *
 *     buildExecutionPlan()
 *         │
 *         ▼
 *     executeExecutionPlan()
 *         │
 *         ├── runSelf()              (per query, no graph recursion)
 *         │
 *         └── scheduleDependents()   (optional reverse cascade)
 *
 *     refresh()                      (pool-level and query-level entry)
 *
 * @param {Object} [options]
 * @param {Object} [options.worker]
 * Worker execution options.
 *
 * @param {boolean} [options.worker.enabled]
 * Enable worker execution.
 *
 * @param {number} [options.worker.computeWorkers]
 * Number of Compute Workers.
 *
 * @param {Object} [options.registry]
 * Optional shared query module registry.
 *
 * @returns {Object}
 */
export function createQueryPool(options = {}) {
	const queries = new Map();

	/**
	 * Reverse dependency graph.
	 *
	 * dependency -> dependents
	 *
	 * Example:
	 *
	 * users -> posts
	 */
	const dependents = new Map();

	/**
	 * Active dependent-refresh promises.
	 *
	 * Prevents duplicate execution of the same dependent
	 * when multiple upstream queries complete in the same turn.
	 */
	const scheduledRefreshes = new Map();

	/**
	 * Cached topological execution plans.
	 *
	 * Dependency edges are fixed at registration time and the
	 * graph only grows, so plans remain valid for the lifetime
	 * of the pool.
	 *
	 * @type {Map<string, Object[]>}
	 */
	const planCache = new Map();

	const registry = options.registry || createQueryModuleRegistry();

	let workerBridge = null;

	function isWorkerEnabled() {
		return options.worker?.enabled === true;
	}

	function getWorkerBridge() {
		if (!workerBridge) {
			workerBridge = createQueryPoolWorkerBridge({
				registry,
				computeWorkers: options.worker?.computeWorkers,
			});
		}

		return workerBridge;
	}

	function validateKey(key) {
		if (typeof key !== "string" || key.length === 0) {
			throw new TypeError("[query-pool] Query key must be a non-empty string.");
		}
	}

	function normalizeDependencies(value) {
		if (value === undefined) {
			return [];
		}

		if (!Array.isArray(value)) {
			throw new TypeError("[query-pool] Query dependsOn must be an array.");
		}

		const seen = new Set();
		const result = [];

		for (const key of value) {
			validateKey(key);

			if (!seen.has(key)) {
				seen.add(key);
				result.push(key);
			}
		}

		return result;
	}

	function validateDefinition(definition) {
		if (!definition || typeof definition !== "object") {
			throw new TypeError("[query-pool] Query definition must be an object.");
		}

		const hasSource = typeof definition.source === "function";

		const hasModule =
			typeof definition.module === "string" && definition.module.length > 0;

		if (!hasSource && !hasModule) {
			throw new TypeError(
				"[query-pool] Query definition requires either a source function or a registered module.",
			);
		}

		if (
			definition.compute !== undefined &&
			typeof definition.compute !== "function"
		) {
			throw new TypeError("[query-pool] Query compute must be a function.");
		}

		if (
			hasModule &&
			(definition.source !== undefined || definition.compute !== undefined)
		) {
			throw new TypeError(
				"[query-pool] A worker query cannot combine module execution with local source or compute functions.",
			);
		}

		if (
			definition.stream !== undefined &&
			typeof definition.stream !== "boolean"
		) {
			throw new TypeError("[query-pool] Query stream must be a boolean.");
		}

		if (
			definition.transfer !== undefined &&
			typeof definition.transfer !== "boolean"
		) {
			throw new TypeError("[query-pool] Query transfer must be a boolean.");
		}

		if (definition.stream === true && !hasModule) {
			throw new TypeError(
				"[query-pool] Query stream is only supported for worker module queries.",
			);
		}

		if (definition.cache !== undefined) {
			if (!definition.cache || typeof definition.cache !== "object") {
				throw new TypeError("[query-pool] Query cache must be an object.");
			}

			if (
				typeof definition.cache.ttl !== "number" ||
				!Number.isFinite(definition.cache.ttl) ||
				definition.cache.ttl < 0
			) {
				throw new TypeError(
					"[query-pool] Query cache ttl must be a non-negative number.",
				);
			}
		}

		normalizeDependencies(definition.dependsOn);
	}

	function resolveModule(key) {
		const descriptor = registry.get(key);

		if (!descriptor) {
			throw new Error(`[query-pool] Query module "${key}" is not registered.`);
		}

		return descriptor;
	}

	/**
	 * Create the query executor.
	 *
	 * @param {string} key
	 * @param {QueryDefinition} definition
	 * @returns {Object}
	 */
	function createExecutor(key, definition) {
		if (definition.module) {
			return {
				async execute({ signal, input, transfer, onChunk, onStreamEnd }) {
					if (!isWorkerEnabled()) {
						throw new Error(
							"[query-pool] Worker execution is disabled. Enable worker execution when using query modules.",
						);
					}

					const descriptor = resolveModule(definition.module);

					return getWorkerBridge().execute({
						key,

						module: descriptor,

						input,

						transfer,

						signal,

						stream: definition.stream === true,

						onChunk,

						onStreamEnd,
					});
				},
			};
		}

		return {
			async execute({ signal, input }) {
				const rawData = await definition.source(signal, input);

				if (definition.compute) {
					return definition.compute(rawData);
				}

				return rawData;
			},
		};
	}

	/**
	 * Build the execution order for a query.
	 *
	 * Performs a depth-first traversal of the dependency graph,
	 * ensuring every dependency executes before the query itself.
	 *
	 * Cyclic dependencies are rejected.
	 *
	 * Results are memoized in planCache because dependency edges
	 * are fixed at registration time.
	 *
	 * @param {string} key
	 * Query key.
	 *
	 * @returns {Object[]}
	 * Ordered query entries.
	 */
	function buildExecutionPlan(key) {
		const cached = planCache.get(key);

		if (cached) {
			return cached;
		}

		const visited = new Set();
		const visiting = new Set();
		const plan = [];

		function visit(queryKey) {
			if (visited.has(queryKey)) {
				return;
			}

			if (visiting.has(queryKey)) {
				throw new Error(
					`[query-pool] Circular dependency detected involving "${queryKey}".`,
				);
			}

			const entry = queries.get(queryKey);

			if (!entry) {
				throw new Error(
					`[query-pool] Unknown dependency "${queryKey}".`,
				);
			}

			visiting.add(queryKey);

			for (const dependency of entry.dependencies) {
				visit(dependency);
			}

			visiting.delete(queryKey);
			visited.add(queryKey);
			plan.push(entry);
		}

		visit(key);

		planCache.set(key, plan);

		return plan;
	}

	/**
	 * Execute a query together with all of its dependencies.
	 *
	 * Dependencies execute first.
	 *
	 * Independent dependency branches execute in parallel once
	 * their own dependencies have completed. Waves are advanced
	 * with a single-pass indegree count (Kahn-style) so each
	 * plan edge is processed a constant number of times.
	 *
	 * Each entry is driven through its internal runSelf() path.
	 * Public query.refresh() is never called from the plan, which
	 * prevents infinite recursion between the graph executor and
	 * the public refresh API.
	 *
	 * Existing in-flight executions are reused unless force is true.
	 *
	 * @param {string} key
	 * Query key.
	 *
	 * @param {Object} [options]
	 *
	 * @param {boolean} [options.force]
	 * Force refresh of every query in the dependency graph that
	 * still needs execution (or all nodes when combined with
	 * needsExecution checks under force).
	 *
	 * @param {boolean} [options.dependents]
	 * When true, schedule reverse-dependent queries after the
	 * plan completes successfully.
	 *
	 * @param {boolean} [options.skipRoot]
	 * When true, execute only the upstream dependency subgraph
	 * and skip the root query itself. Used by fetch({ dependencies: true })
	 * so the root can still run with explicit input afterward.
	 *
	 * @returns {Promise<any>}
	 * Data for the root query key, or undefined when skipRoot is true.
	 */
	async function executeExecutionPlan(key, options = {}) {
		const force = options.force === true;
		const skipRoot = options.skipRoot === true;
		const fullPlan = buildExecutionPlan(key);

		const plan = skipRoot
			? fullPlan.filter((entry) => entry.key !== key)
			: fullPlan;

		if (plan.length === 0) {
			return skipRoot ? undefined : queries.get(key)?.query.data;
		}

		/**
		 * Kahn-style wave execution over the plan subgraph.
		 *
		 * Indegrees and in-plan reverse edges are computed once so
		 * each wave is O(wave size + edges) instead of rescanning
		 * the full plan on every iteration.
		 */
		const planKeys = new Set();
		const indegree = new Map();
		const dependentsInPlan = new Map();

		for (const entry of plan) {
			planKeys.add(entry.key);
			indegree.set(entry.key, 0);
			dependentsInPlan.set(entry.key, []);
		}

		for (const entry of plan) {
			for (const dependency of entry.dependencies) {
				if (planKeys.has(dependency)) {
					indegree.set(entry.key, indegree.get(entry.key) + 1);
					dependentsInPlan.get(dependency).push(entry);
				}
			}
		}

		let ready = [];

		for (const entry of plan) {
			if (indegree.get(entry.key) === 0) {
				ready.push(entry);
			}
		}

		const completed = new Set();

		while (completed.size < plan.length) {
			if (ready.length === 0) {
				throw new Error(
					`[query-pool] Unable to progress dependency plan for "${key}".`,
				);
			}

			const wave = ready;
			ready = [];

			await Promise.all(
				wave.map(async (entry) => {
					try {
						if (force || entry.needsExecution()) {
							await entry.runSelf({
								force,
							});
						}

						completed.add(entry.key);

						for (const dependent of dependentsInPlan.get(entry.key)) {
							const next = indegree.get(dependent.key) - 1;
							indegree.set(dependent.key, next);

							if (next === 0) {
								ready.push(dependent);
							}
						}
					} catch (error) {
						/**
						 * Only wrap upstream dependency failures.
						 * The plan root keeps its original error
						 * (including AbortError) so callers can
						 * match status / name without unwrapping.
						 */
						if (entry.key === key) {
							throw error;
						}

						throw new QueryDependencyError(
							entry.key,
							error,
						);
					}
				}),
			);
		}

		if (!skipRoot && options.dependents === true) {
			scheduleDependents(key);
		}

		if (skipRoot) {
			return undefined;
		}

		return queries.get(key)?.query.data;
	}

	/**
	 * Schedule refresh of all dependent queries.
	 *
	 * Refresh requests are deduplicated so repeated updates
	 * only trigger one execution plan per dependent key.
	 *
	 * Each dependent is invalidated and then re-executed through
	 * executeExecutionPlan (dependencies of the dependent still
	 * run first). The plan is invoked with dependents: true so
	 * reverse cascade continues for the full downstream graph
	 * (deduped per key via scheduledRefreshes).
	 *
	 * Failures are handled on the scheduled promise so a dependent
	 * error does not surface as an unhandled rejection. The failed
	 * entry still exposes status/error on its query handle.
	 *
	 * @param {string} key
	 * Upstream query key whose dependents should refresh.
	 */
	function scheduleDependents(key) {
		const dependentKeys = dependents.get(key);

		if (!dependentKeys || dependentKeys.size === 0) {
			return;
		}

		for (const dependent of dependentKeys) {
			if (scheduledRefreshes.has(dependent)) {
				continue;
			}

			const promise = Promise.resolve()
				.then(async () => {
					const entry = queries.get(dependent);

					if (!entry) {
						return;
					}

					entry.query.invalidate();

					/**
					 * Deep cascade: re-run this dependent and continue
					 * scheduling its own dependents. scheduledRefreshes
					 * prevents duplicate plans for the same key.
					 */
					await executeExecutionPlan(dependent, {
						dependents: true,
					});
				})
				.catch(() => {
					/**
					 * Dependent refresh failed.
					 * entry.query.status / entry.query.error already set.
					 */
				})
				.finally(() => {
					scheduledRefreshes.delete(dependent);
				});

			scheduledRefreshes.set(dependent, promise);
		}
	}

	/**
	 * Refresh a registered query by key.
	 *
	 * Runs the dependency execution plan for the query.
	 * Dependencies execute first; independent branches run in parallel.
	 *
	 * @param {string} key
	 * Query key.
	 *
	 * @param {Object} [options]
	 *
	 * @param {boolean} [options.force]
	 * Cancel in-flight work where applicable and re-execute.
	 *
	 * @param {boolean} [options.dependents]
	 * When true, also schedule queries that depend on this key
	 * after the plan completes.
	 *
	 * @returns {Promise<any>}
	 */
	function refresh(key, options = {}) {
		validateKey(key);

		if (!queries.has(key)) {
			return Promise.reject(
				new Error(`[query-pool] Query "${key}" does not exist.`),
			);
		}

		return executeExecutionPlan(key, options);
	}

	/**
	 * Create a query entry.
	 *
	 * @param {string} key
	 * @param {QueryDefinition} definition
	 * @returns {Object}
	 */
	function createEntry(key, definition) {
		const state = reactive({
			data: undefined,

			chunks: [],

			error: null,

			loading: false,

			streaming: false,

			streamed: false,

			/**
			 * Query lifecycle status.
			 *
			 * idle       - No execution has started.
			 * loading    - Execution is currently running.
			 * success    - Latest execution completed successfully.
			 * error      - Latest execution failed.
			 * cancelled  - Latest execution was cancelled.
			 */
			status: "idle",
		});

		const executor = createExecutor(key, definition);

		let executionId = 0;

		let abortController = null;

		let inFlight = null;

		let cache = null;

		/**
		 * Cached query input.
		 *
		 * Input is cached only when the execution uses
		 * structured cloning.
		 *
		 * Transferable input cannot be reused because
		 * transferring detaches the transferable from the sender.
		 *
		 * The initial value comes from the query definition.
		 */
		let cachedInput = definition.input;

		let hasCachedInput = definition.input !== undefined;

		function hasData() {
			return state.data !== undefined;
		}

		function isCacheEnabled() {
			return definition.cache !== undefined;
		}

		function isCacheFresh() {
			if (!cache || !isCacheEnabled() || cache.stale) {
				return false;
			}

			return Date.now() < cache.expiresAt;
		}

		function setCache(data) {
			if (!isCacheEnabled()) {
				return;
			}

			cache = {
				data,

				expiresAt: Date.now() + definition.cache.ttl,

				stale: false,
			};
		}

		function invalidate() {
			if (cache) {
				cache.stale = true;
			}
		}

		function cancel() {
			executionId++;

			if (abortController) {
				abortController.abort();
				abortController = null;
			}

			inFlight = null;

			state.loading = false;

			state.streaming = false;

			/**
			 * Cancellation represents a terminal execution state.
			 *
			 * Keep existing data intact, but expose that the current
			 * execution did not complete successfully.
			 */
			if (state.status === "loading") {
				state.status = "cancelled";
			}
		}

		function reset() {
			cancel();

			cache = null;

			cachedInput = undefined;

			hasCachedInput = false;

			state.data = undefined;

			state.chunks = [];

			state.error = null;

			state.loading = false;

			state.streaming = false;

			state.streamed = false;

			state.status = "idle";
		}

		/**
		 * Execute a query.
		 *
		 * Low-level path used by fetch() and runSelf().
		 * Does not walk the dependency graph.
		 *
		 * @param {Object} [options]
		 * @param {any} [options.input]
		 * Query input.
		 *
		 * @param {boolean} [options.transfer]
		 * Resolved Transferable Object transport option.
		 *
		 * @param {boolean} [options.cacheInput]
		 * Internal input cache behavior.
		 *
		 * @returns {Promise<any>}
		 */
		function execute(options = {}) {
			executionId++;

			const id = executionId;

			const controller = new AbortController();

			abortController = controller;

			const transfer = options.transfer === true;

			const input =
				options.input !== undefined
					? options.input
					: cachedInput;

			/**
			 * Only structured-cloned input may be cached.
			 *
			 * A transferred ArrayBuffer, MessagePort, ImageBitmap,
			 * or OffscreenCanvas cannot safely remain as reusable
			 * query input on the sender side.
			 */
			if (
				options.cacheInput === true &&
				options.input !== undefined &&
				transfer === false
			) {
				cachedInput = options.input;
				hasCachedInput = true;
			}

			state.loading = true;

			state.status = "loading";

			state.streaming = definition.stream === true;

			state.streamed = false;

			state.error = null;

			state.chunks = [];

			let promise;

			promise = (async () => {
				try {
					const data = await executor.execute({
						signal: controller.signal,

						input,

						transfer,

						onChunk(chunk) {
							if (id !== executionId) {
								return;
							}

							state.chunks.push(chunk);

							state.streamed = true;

							state.streaming = true;
						},

						onStreamEnd() {
							if (id !== executionId) {
								return;
							}

							state.streaming = false;
						},
					});

					if (id !== executionId) {
						throw new DOMException(
							"Query execution was aborted.",
							"AbortError",
						);
					}

					setCache(data);

					state.data = data;

					state.error = null;

					state.loading = false;

					state.streaming = false;

					state.status = "success";

					abortController = null;

					return data;

				} catch (error) {
					if (id !== executionId) {
						throw new DOMException(
							"Query execution was aborted.",
							"AbortError",
						);
					}

					const aborted =
						controller.signal.aborted ||
						error?.name === "AbortError";

					state.loading = false;

					state.streaming = false;

					abortController = null;

					if (aborted) {
						if (state.status === "loading") {
							state.status = "cancelled";
						}

						throw error instanceof Error
							? error
							: new DOMException(
									"Query execution was aborted.",
									"AbortError",
								);
					}

					/**
					 * Always mark the latest execution as failed.
					 *
					 * Existing data is left intact so callers can keep
					 * showing the last successful result while error is set.
					 */
					state.error = error;

					state.status = "error";

					throw error;

				} finally {
					if (inFlight === promise) {
						inFlight = null;
					}
				}
			})();

			inFlight = promise;

			return promise;
		}

		/**
		 * Run this query only.
		 *
		 * Honors in-flight reuse, force cancellation, and cache freshness.
		 * Does not walk the dependency graph. Used by executeExecutionPlan
		 * so graph execution cannot recurse into public refresh().
		 *
		 * @param {Object} [options]
		 *
		 * @param {boolean} [options.force]
		 * Cancel any in-flight execution and start a new execution.
		 *
		 * @returns {Promise<any>}
		 */
		async function runSelf(options = {}) {
			const force = options.force === true;

			if (!force && inFlight) {
				return inFlight;
			}

			if (force && inFlight) {
				cancel();
			}

			if (!force && cache && isCacheFresh()) {
				state.data = cache.data;

				state.error = null;

				state.loading = false;

				state.streaming = false;

				state.status = "success";

				return cache.data;
			}

			if (hasCachedInput) {
				return execute({
					input: cachedInput,

					transfer: false,

					cacheInput: false,
				});
			}

			return execute({
				transfer: definition.transfer === true,
			});
		}

		/**
		 * Fetch query data using explicit input.
		 *
		 * Query input uses structured cloning by default.
		 * Transferable Object transport can be enabled for an
		 * individual execution through the transfer option,
		 * overriding the query definition's default behavior.
		 *
		 * Input is cached only when the resolved transport
		 * uses structured cloning.
		 *
		 * By default, fetch executes only this query. Upstream
		 * dependsOn entries are not run unless dependencies is true.
		 *
		 * When dependencies is true, the upstream dependency plan
		 * runs first (skipping this query), then this query executes
		 * with the provided input. That preserves explicit input on
		 * the leaf while still honoring dependsOn.
		 *
		 * After a successful fetch, dependent queries are
		 * scheduled through scheduleDependents().
		 *
		 * @param {Object} [options]
		 * @param {any} [options.input]
		 * Query input.
		 *
		 * @param {boolean} [options.transfer]
		 * Override the query definition's default Transferable
		 * Object transport option.
		 *
		 * @param {boolean} [options.dependencies]
		 * When true, ensure dependsOn queries are loaded before
		 * executing this query with input.
		 *
		 * @param {boolean} [options.force]
		 * When dependencies is true, force upstream nodes to
		 * re-execute instead of reusing fresh cache.
		 *
		 * @returns {Promise<any>}
		 */
		async function fetch(options = {}) {
			const transfer =
				options.transfer !== undefined
					? options.transfer === true
					: definition.transfer === true;

			if (options.dependencies === true) {
				await executeExecutionPlan(key, {
					force: options.force === true,
					skipRoot: true,
				});
			}

			const result = await execute({
				input: options.input,

				transfer,

				cacheInput: true,
			});

			/**
			 * Only cascade after a successful execution.
			 * Superseded or cancelled runs reject and never reach here.
			 */
			scheduleDependents(key);

			return result;
		}

		/**
		 * Refresh query data.
		 *
		 * Runs the dependency execution plan for this query.
		 * Dependencies execute first. Independent branches run in parallel.
		 *
		 * @param {Object} [options]
		 *
		 * @param {boolean} [options.force]
		 * Cancel any in-flight execution and start a new execution
		 * for nodes in the plan that require work.
		 *
		 * @param {boolean} [options.dependents]
		 * When true, schedule reverse-dependent queries after the
		 * plan completes.
		 *
		 * @returns {Promise<any>}
		 */
		async function refresh(options = {}) {
			return executeExecutionPlan(key, options);
		}

		const queryApi = {
			get data() {
				return state.data;
			},

			get chunks() {
				return state.chunks;
			},

			get error() {
				return state.error;
			},

			get loading() {
				return state.loading;
			},

			get streaming() {
				return state.streaming;
			},

			get streamed() {
				return state.streamed;
			},

			get status() {
				return state.status;
			},

			fetch,

			refresh,

			cancel,

			reset,

			invalidate,
		};

		return {
			key,

			definition,

			state,

			query: queryApi,

			/**
			 * Forward dependency keys for this query.
			 * Populated when the query is registered.
			 *
			 * @type {string[]}
			 */
			dependencies: [],

			hasData,

			needsExecution() {
				return !hasData() || !isCacheFresh();
			},

			runSelf,
		};
	}

	/**
	 * Register a query.
	 *
	 * Builds reverse dependency edges for dependsOn and starts
	 * an initial execution plan (dependencies first).
	 *
	 * @param {string} key
	 * @param {QueryDefinition} definition
	 * @returns {Object}
	 */
	function query(key, definition) {
		validateKey(key);

		const existing = queries.get(key);

		if (existing) {
			return existing.query;
		}

		validateDefinition(definition);

		if (definition.module) {
			resolveModule(definition.module);
		}

		const entry = createEntry(key, definition);

		entry.dependencies = normalizeDependencies(
			definition.dependsOn,
		);

		for (const dependency of entry.dependencies) {
			let set = dependents.get(dependency);

			if (!set) {
				set = new Set();
				dependents.set(dependency, set);
			}

			set.add(key);
		}

		queries.set(key, entry);

		/**
		 * Whether cached input exists or not has no effect on whether
		 * the initial execution occurs.
		 *
		 * Worker module queries with a query-definition input can be
		 * supplied through the fetch API. Existing automatic query
		 * initialization behavior remains unchanged for queries that
		 * do not require explicit input.
		 *
		 * Initial load goes through executeExecutionPlan so
		 * dependsOn is honored without recursing into public refresh.
		 */
		executeExecutionPlan(key).catch(() => {});

		return entry.query;
	}

	function data(key) {
		return queries.get(key)?.query.data;
	}

	/**
	 * Write reactive query data without going through source/module.
	 *
	 * Used by mutation onMutate / onError for optimistic updates
	 * and rollbacks.
	 *
	 * @param {string} key
	 * Query key.
	 *
	 * @param {any|Function} updater
	 * Next value, or a function `(previous) => next`.
	 *
	 * @returns {boolean}
	 * True when the query exists and was updated.
	 */
	function setQueryData(key, updater) {
		const entry = queries.get(key);

		if (!entry) {
			return false;
		}

		const previous = entry.state.data;

		const next =
			typeof updater === "function" ? updater(previous) : updater;

		entry.state.data = next;

		return true;
	}

	/**
	 * Mutation definition.
	 *
	 * A mutation performs a write (local execute or worker module)
	 * and optionally invalidates related queries.
	 *
	 * Local execution:
	 *
	 *     execute(input, { signal, stream?, endStream? })
	 *
	 * Worker module execution:
	 *
	 *     module.query(context)
	 *
	 * @typedef {Object} MutationDefinition
	 *
	 * @property {Function} [execute]
	 * Local mutation function.
	 *
	 * Receives `(input, context)` where context includes
	 * `signal` and, when stream is enabled, `stream` / `endStream`.
	 *
	 * @property {string} [module]
	 * Registered worker module key.
	 *
	 * @property {boolean} [stream]
	 * Enable streaming chunks for this mutation.
	 *
	 * @property {Object} [defaults]
	 * Default mutate options.
	 *
	 * @property {boolean} [defaults.transfer]
	 * Default Transferable Object transport for mutate input.
	 *
	 * @property {Function} [onMutate]
	 * Runs before execute. May update query data optimistically.
	 * Return value is merged into the mutation context for onError/onSuccess.
	 *
	 * @property {Function} [onError]
	 * Runs when execute fails. Useful for rolling back onMutate changes.
	 *
	 * @property {Function} [onSuccess]
	 * Runs after a successful execute, before invalidations.
	 *
	 * @property {Array<string|Object>} [invalidates]
	 * Query keys to invalidate and refresh after success.
	 *
	 * Entries may be a string key or `{ key, dependents?, force? }`.
	 * `dependents: true` maps to refresh(..., { dependents: true }).
	 */

	/**
	 * Normalize an invalidates list entry.
	 *
	 * @param {string|Object} entry
	 * @returns {{ key: string, dependents: boolean, force: boolean }}
	 */
	function normalizeInvalidateEntry(entry) {
		if (typeof entry === "string") {
			validateKey(entry);

			return {
				key: entry,
				dependents: false,
				force: false,
			};
		}

		if (!entry || typeof entry !== "object" || typeof entry.key !== "string") {
			throw new TypeError(
				"[query-pool] invalidates entries must be a string or { key, dependents?, force? }.",
			);
		}

		validateKey(entry.key);

		return {
			key: entry.key,
			dependents: entry.dependents === true,
			force: entry.force === true,
		};
	}

	/**
	 * Validate a mutation definition.
	 *
	 * @param {MutationDefinition} definition
	 */
	function validateMutationDefinition(definition) {
		if (!definition || typeof definition !== "object") {
			throw new TypeError(
				"[query-pool] Mutation definition must be an object.",
			);
		}

		const hasExecute = typeof definition.execute === "function";

		const hasModule =
			typeof definition.module === "string" && definition.module.length > 0;

		if (!hasExecute && !hasModule) {
			throw new TypeError(
				"[query-pool] Mutation definition requires either an execute function or a registered module.",
			);
		}

		if (hasExecute && hasModule) {
			throw new TypeError(
				"[query-pool] A mutation cannot combine execute with module execution.",
			);
		}

		if (
			definition.stream !== undefined &&
			typeof definition.stream !== "boolean"
		) {
			throw new TypeError("[query-pool] Mutation stream must be a boolean.");
		}

		if (definition.defaults !== undefined) {
			if (
				!definition.defaults ||
				typeof definition.defaults !== "object"
			) {
				throw new TypeError(
					"[query-pool] Mutation defaults must be an object.",
				);
			}

			if (
				definition.defaults.transfer !== undefined &&
				typeof definition.defaults.transfer !== "boolean"
			) {
				throw new TypeError(
					"[query-pool] Mutation defaults.transfer must be a boolean.",
				);
			}
		}

		if (
			definition.onMutate !== undefined &&
			typeof definition.onMutate !== "function"
		) {
			throw new TypeError("[query-pool] Mutation onMutate must be a function.");
		}

		if (
			definition.onError !== undefined &&
			typeof definition.onError !== "function"
		) {
			throw new TypeError("[query-pool] Mutation onError must be a function.");
		}

		if (
			definition.onSuccess !== undefined &&
			typeof definition.onSuccess !== "function"
		) {
			throw new TypeError(
				"[query-pool] Mutation onSuccess must be a function.",
			);
		}

		if (definition.invalidates !== undefined) {
			if (!Array.isArray(definition.invalidates)) {
				throw new TypeError(
					"[query-pool] Mutation invalidates must be an array.",
				);
			}

			for (const entry of definition.invalidates) {
				normalizeInvalidateEntry(entry);
			}
		}
	}

	/**
	 * Run post-success query invalidations.
	 *
	 * Each entry is invalidated then refreshed. Refresh failures do not
	 * reject the mutation; the write already succeeded.
	 *
	 * @param {Array<string|Object>} invalidates
	 * @param {Object} [options]
	 * @param {boolean} [options.force]
	 * @returns {Promise<void>}
	 */
	async function runInvalidations(invalidates, options = {}) {
		if (!invalidates || invalidates.length === 0) {
			return;
		}

		const force = options.force === true;

		const tasks = [];

		for (const raw of invalidates) {
			let entry;

			try {
				entry = normalizeInvalidateEntry(raw);
			} catch {
				console.warn(
					"[query-pool] Skipping invalid invalidates entry.",
					raw,
				);
				continue;
			}

			const queryEntry = queries.get(entry.key);

			if (!queryEntry) {
				console.warn(
					`[query-pool] invalidates target "${entry.key}" is not a registered query.`,
				);
				continue;
			}

			queryEntry.query.invalidate();

			tasks.push(
				executeExecutionPlan(entry.key, {
					force: force || entry.force,
					dependents: entry.dependents,
				}).catch((error) => {
					console.warn(
						`[query-pool] Failed to refresh invalidated query "${entry.key}".`,
						error,
					);
				}),
			);
		}

		await Promise.all(tasks);
	}

	/**
	 * Create a mutation entry.
	 *
	 * @param {string} key
	 * @param {MutationDefinition} definition
	 * @returns {Object}
	 */
	function createMutationEntry(key, definition) {
		const streamEnabled = definition.stream === true;

		const state = reactive({
			data: undefined,

			variables: undefined,

			chunks: [],

			error: null,

			loading: false,

			streaming: false,

			streamed: false,

			/**
			 * Mutation lifecycle status.
			 *
			 * idle       - No mutation has started.
			 * loading    - Mutation is currently running.
			 * success    - Latest mutation completed successfully.
			 * error      - Latest mutation failed.
			 * cancelled  - Latest mutation was cancelled.
			 */
			status: "idle",
		});

		let runId = 0;

		let abortController = null;

		let inFlight = null;

		/**
		 * Build stream helpers for local execute.
		 *
		 * @param {number} id
		 * @param {AbortSignal} signal
		 * @returns {{ stream: Function, endStream: Function }}
		 */
		function createStreamHelpers(id, signal) {
			let streamEnded = false;

			function stream(chunk) {
				if (!streamEnabled) {
					throw new Error(
						"[query-pool] Streaming is not enabled for this mutation.",
					);
				}

				if (signal.aborted) {
					throw new DOMException(
						"Mutation execution was aborted.",
						"AbortError",
					);
				}

				if (id !== runId) {
					return;
				}

				if (streamEnded) {
					throw new Error(
						"[query-pool] Cannot stream data after endStream() has been called.",
					);
				}

				state.chunks.push(chunk);
				state.streamed = true;
				state.streaming = true;
			}

			function endStream() {
				if (!streamEnabled) {
					throw new Error(
						"[query-pool] Streaming is not enabled for this mutation.",
					);
				}

				if (streamEnded || id !== runId) {
					return;
				}

				streamEnded = true;
				state.streaming = false;
			}

			return { stream, endStream };
		}

		/**
		 * Run the local or worker mutation body.
		 *
		 * @param {any} input
		 * @param {Object} options
		 * @param {AbortSignal} options.signal
		 * @param {boolean} options.transfer
		 * @param {number} options.id
		 * @returns {Promise<any>}
		 */
		async function runBody(input, options) {
			const { signal, transfer, id } = options;

			if (definition.module) {
				if (!isWorkerEnabled()) {
					throw new Error(
						"[query-pool] Worker execution is disabled. Enable worker execution when using mutation modules.",
					);
				}

				const descriptor = resolveModule(definition.module);

				return getWorkerBridge().execute({
					key,

					module: descriptor,

					input,

					transfer,

					signal,

					stream: streamEnabled,

					onChunk(chunk) {
						if (id !== runId) {
							return;
						}

						state.chunks.push(chunk);
						state.streamed = true;
						state.streaming = true;
					},

					onStreamEnd() {
						if (id !== runId) {
							return;
						}

						state.streaming = false;
					},
				});
			}

			const streamHelpers = streamEnabled
				? createStreamHelpers(id, signal)
				: {
						stream() {
							throw new Error(
								"[query-pool] Streaming is not enabled for this mutation.",
							);
						},
						endStream() {},
					};

			return definition.execute(input, {
				signal,
				stream: streamHelpers.stream,
				endStream: streamHelpers.endStream,
			});
		}

		function cancel() {
			runId++;

			if (abortController) {
				abortController.abort();
				abortController = null;
			}

			inFlight = null;

			state.loading = false;
			state.streaming = false;

			if (state.status === "loading") {
				state.status = "cancelled";
			}
		}

		function reset() {
			cancel();

			state.data = undefined;
			state.variables = undefined;
			state.chunks = [];
			state.error = null;
			state.loading = false;
			state.streaming = false;
			state.streamed = false;
			state.status = "idle";
		}

		/**
		 * Perform the mutation.
		 *
		 * @param {any} input
		 * Mutation input / variables.
		 *
		 * @param {Object} [options]
		 *
		 * @param {boolean} [options.transfer]
		 * Transferable Object transport for worker input.
		 * Overrides definition.defaults.transfer.
		 *
		 * @param {boolean} [options.force]
		 * Forwarded to invalidation refreshes.
		 *
		 * @param {boolean} [options.skipInvalidation]
		 * When true, skip invalidates after success.
		 *
		 * @param {boolean} [options.awaitInvalidations]
		 * When true (default), mutate resolves after invalidation
		 * refreshes settle. When false, invalidations are started
		 * without blocking the mutate promise.
		 *
		 * @returns {Promise<any>}
		 */
		function mutate(input, options = {}) {
			/**
			 * Supersede any in-flight mutation on this key.
			 * A single runId increment invalidates the previous run;
			 * abort wakes it so it can settle with AbortError.
			 */
			runId++;

			if (abortController) {
				abortController.abort();
				abortController = null;
			}

			inFlight = null;

			const id = runId;

			const controller = new AbortController();

			abortController = controller;

			const transfer =
				options.transfer !== undefined
					? options.transfer === true
					: definition.defaults?.transfer === true;

			const skipInvalidation = options.skipInvalidation === true;

			const awaitInvalidations = options.awaitInvalidations !== false;

			const force = options.force === true;

			state.loading = true;
			state.status = "loading";
			state.error = null;
			state.variables = input;
			state.chunks = [];
			state.streamed = false;
			state.streaming = streamEnabled;

			const mutationContext = {
				pool: publicApi,

				getQueryData(queryKey) {
					return data(queryKey);
				},

				setQueryData,
			};

			let promise;

			promise = (async () => {
				try {
					if (typeof definition.onMutate === "function") {
						const onMutateResult = await definition.onMutate(
							input,
							mutationContext,
						);

						if (
							onMutateResult &&
							typeof onMutateResult === "object"
						) {
							Object.assign(mutationContext, onMutateResult);
						}
					}

					if (controller.signal.aborted || id !== runId) {
						throw new DOMException(
							"Mutation execution was aborted.",
							"AbortError",
						);
					}

					const result = await runBody(input, {
						signal: controller.signal,
						transfer,
						id,
					});

					if (controller.signal.aborted || id !== runId) {
						throw new DOMException(
							"Mutation execution was aborted.",
							"AbortError",
						);
					}

					state.data = result;
					state.error = null;
					state.loading = false;
					state.streaming = false;
					state.status = "success";
					abortController = null;

					if (typeof definition.onSuccess === "function") {
						await definition.onSuccess(
							result,
							input,
							mutationContext,
						);
					}

					if (!skipInvalidation && definition.invalidates) {
						const invalidation = runInvalidations(
							definition.invalidates,
							{ force },
						);

						if (awaitInvalidations) {
							await invalidation;
						}
					}

					return result;
				} catch (error) {
					if (id !== runId) {
						throw new DOMException(
							"Mutation execution was aborted.",
							"AbortError",
						);
					}

					const aborted =
						controller.signal.aborted ||
						error?.name === "AbortError";

					state.loading = false;
					state.streaming = false;
					abortController = null;

					if (aborted) {
						state.status = "cancelled";
						throw error instanceof Error
							? error
							: new DOMException(
									"Mutation execution was aborted.",
									"AbortError",
								);
					}

					state.error = error;
					state.status = "error";

					if (typeof definition.onError === "function") {
						try {
							await definition.onError(
								error,
								input,
								mutationContext,
							);
						} catch (onErrorFailure) {
							console.warn(
								`[query-pool] Mutation "${key}" onError failed.`,
								onErrorFailure,
							);
						}
					}

					throw error;
				} finally {
					if (inFlight === promise) {
						inFlight = null;
					}
				}
			})();

			inFlight = promise;

			return promise;
		}

		const handle = {
			get data() {
				return state.data;
			},

			get variables() {
				return state.variables;
			},

			get chunks() {
				return state.chunks;
			},

			get error() {
				return state.error;
			},

			get loading() {
				return state.loading;
			},

			get streaming() {
				return state.streaming;
			},

			get streamed() {
				return state.streamed;
			},

			get status() {
				return state.status;
			},

			mutate,

			cancel,

			reset,
		};

		return {
			key,
			definition,
			state,
			handle,
		};
	}

	/**
	 * Registered mutations.
	 *
	 * @type {Map<string, Object>}
	 */
	const mutations = new Map();

	/**
	 * Register a mutation.
	 *
	 * @param {string} key
	 * Mutation key.
	 *
	 * @param {MutationDefinition} definition
	 * Mutation definition.
	 *
	 * @returns {Object}
	 * Mutation handle.
	 */
	function mutation(key, definition) {
		validateKey(key);

		const existing = mutations.get(key);

		if (existing) {
			return existing.handle;
		}

		validateMutationDefinition(definition);

		if (definition.module) {
			resolveModule(definition.module);
		}

		const entry = createMutationEntry(key, definition);

		mutations.set(key, entry);

		return entry.handle;
	}

	/**
	 * Get a mutation handle by key.
	 *
	 * @param {string} key
	 * @returns {Object|undefined}
	 */
	function getMutation(key) {
		return mutations.get(key)?.handle;
	}

	/**
	 * Check whether a mutation is registered.
	 *
	 * @param {string} key
	 * @returns {boolean}
	 */
	function hasMutation(key) {
		return mutations.has(key);
	}

	function registerModule(key, definition) {
		return registry.register(key, definition);
	}

	function registerModules(definitions) {
		return registry.registerAll(definitions);
	}

	function getModule(key) {
		return registry.get(key);
	}

	function removeModule(key) {
		return registry.remove(key);
	}

	function terminate() {
		for (const entry of mutations.values()) {
			entry.handle.cancel();
		}

		if (workerBridge) {
			workerBridge.terminate();
			workerBridge = null;
		}
	}

	const publicApi = {
		query,

		data,

		setQueryData,

		/**
		 * Refresh a query by key through the dependency execution plan.
		 *
		 * @param {string} key
		 * @param {Object} [options]
		 * @param {boolean} [options.force]
		 * @param {boolean} [options.dependents]
		 * @returns {Promise<any>}
		 */
		refresh,

		/**
		 * Register a mutation.
		 *
		 * @param {string} key
		 * @param {MutationDefinition} definition
		 * @returns {Object}
		 */
		mutation,

		/**
		 * Get a registered mutation handle.
		 *
		 * @param {string} key
		 * @returns {Object|undefined}
		 */
		getMutation,

		/**
		 * Whether a mutation key is registered.
		 *
		 * @param {string} key
		 * @returns {boolean}
		 */
		hasMutation,

		registerModule,

		registerModules,

		getModule,

		removeModule,

		get(key) {
			return queries.get(key)?.query;
		},

		has(key) {
			return queries.has(key);
		},

		terminate,
	};

	return publicApi;
}
