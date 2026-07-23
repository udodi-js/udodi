import { defineStore } from "./registry.js";

// Global layers

const inFlight = new Map();
const cache = new Map();
const controllers = new Map();
const graph = new Map();
const queryCleanups = new WeakMap(); // store -> cleanup function

// Stable query key normalization

function stableSerialize(value) {
	if (value === null || value === undefined) {
		return "null";
	}

	const type = typeof value;

	// primitive
	if (
		type === "string" ||
		type === "number" ||
		type === "boolean" ||
		type === "bigint"
	) {
		return JSON.stringify(value);
	}

	// date
	if (value instanceof Date) {
		return `Date(${value.toISOString()})`;
	}

	// array
	if (Array.isArray(value)) {
		return `[${value.map(stableSerialize).join(",")}]`;
	}

	// object
	if (type === "object") {
		const keys = Object.keys(value).sort();

		return `{${keys
			.map((k) => `${JSON.stringify(k)}:${stableSerialize(value[k])}`)
			.join(",")}}`;
	}

	// fallback
	return String(value);
}

function buildQueryKey(name, args) {
	if (args === undefined) {
		return name;
	}

	return `${name}:${stableSerialize(args)}`;
}

// Cache

function setCache(key, value, ttl) {
	const expiresAt = ttl > 0 ? Date.now() + ttl : null;

	cache.set(key, {
		value,
		expiresAt,
	});

	// Simple bounded cache protection
	if (cache.size > 1000) {
		const oldest = cache.keys().next().value;

		if (oldest) {
			cache.delete(oldest);
		}
	}
}

function getCache(key) {
	const entry = cache.get(key);

	if (!entry) {
		return null;
	}

	// expired
	if (entry.expiresAt && Date.now() > entry.expiresAt) {
		cache.delete(key);
		return null;
	}

	return entry.value;
}

// Invalidation

/**
 * Register dependency relationships for query invalidation.
 *
 * @param {string} key - query key or pattern.
 * @param {string|string[]} deps - dependent keys to invalidate.
 */
export function registerInvalidationDependency(key, deps) {
	if (!graph.has(key)) {
		graph.set(key, new Set());
	}

	const arr = Array.isArray(deps) ? deps : [deps];

	for (const dep of arr) {
		graph.get(key).add(dep);
	}
}

/**
 * Cleanup resources for a query store.
 *
 * @param {object} store - query store instance returned by createQuery.
 */
export function cleanupQuery(store) {
	const cleanup = queryCleanups.get(store);

	if (cleanup) {
		cleanup();
	}
}

/**
 * Invalidate cached queries matching a pattern.
 *
 * @param {string} pattern - cache key substring or dependency pattern.
 */
export function invalidateQueries(pattern) {
	const targets = new Set();

	// Cache matches
	for (const key of cache.keys()) {
		if (key.includes(pattern)) {
			targets.add(key);
		}
	}

	// In-flight matches
	for (const key of inFlight.keys()) {
		if (key.includes(pattern)) {
			targets.add(key);
		}
	}

	// Dependency graph matches
	if (graph.has(pattern)) {
		for (const dep of graph.get(pattern)) {
			targets.add(dep);
		}
	}

	for (const key of targets) {
		cache.delete(key);
		inFlight.delete(key);

		const controller = controllers.get(key);

		if (controller) {
			controller.abort();
		}

		controllers.delete(key);
	}
}

// Query factory

/**
 * Create a query-backed store module.
 *
 * @param {string} name - module name.
 * @param {function(any, AbortSignal): Promise<any>} fetchFn - function that fetches data.
 * @param {object} [options] - query options.
 * @param {number} [options.cacheTime=0] - cache time in milliseconds.
 * @param {number} [options.retry=3] - retry count.
 * @param {number} [options.retryDelay=2000] - base retry delay in ms.
 * @param {boolean} [options.globalDedupe=true] - deduplicate concurrent requests.
 * @param {function(any): void} [options.onSuccess] - success callback.
 * @param {function(any): void} [options.onError] - error callback.
 * @returns {object} query store module.
 */
export function createQuery(name, fetchFn, options = {}) {
	const {
		cacheTime = 0,
		retry = 3,
		retryDelay = 2000,
		globalDedupe = true,
		onSuccess,
		onError,
	} = options;

	const store = defineStore(name, {
		state: {
			data: null,
			status: "idle",
			error: null,
			isFetching: false,
			updatedAt: null,
		},

		actions: {
			async fetch({ set }, args) {
				const key = buildQueryKey(name, args);

				set("isFetching", true);

				// Cache hit

				if (cacheTime > 0) {
					const cached = getCache(key);

					if (cached !== null) {
						set("data", cached);
						set("status", "success");
						set("error", null);
						set("isFetching", false);

						return cached;
					}
				}

				// In-flight dedupe

				if (globalDedupe && inFlight.has(key)) {
					try {
						const data = await inFlight.get(key);

						set("data", data);
						set("status", "success");
						set("error", null);
						set("isFetching", false);

						return data;
					} catch {
						// fall through to retry logic
					}
				}

				// Abort previous request ONLY if dedupe is disabled

				if (!globalDedupe) {
					const existingController = controllers.get(key);

					if (existingController) {
						existingController.abort();
						controllers.delete(key);
					}
				}

				const controller = new AbortController();

				controllers.set(key, controller);

				let lastError = null;

				for (let i = 0; i <= retry; i++) {
					try {
						const promise = Promise.resolve(fetchFn(args, controller.signal));

						if (globalDedupe) {
							inFlight.set(key, promise);
						}

						const data = await promise;

						// aborted after resolution

						if (controller.signal.aborted) {
							inFlight.delete(key);
							controllers.delete(key);

							set("isFetching", false);

							return;
						}

						inFlight.delete(key);
						controllers.delete(key);

						if (cacheTime > 0) {
							setCache(key, data, cacheTime);
						}

						set("data", data);
						set("status", "success");
						set("error", null);
						set("isFetching", false);
						set("updatedAt", Date.now());

						onSuccess?.(data, args);

						return data;
					} catch (err) {
						const isAbort =
							controller.signal.aborted || err?.name === "AbortError";

						// aborts should NEVER retry

						if (isAbort) {
							inFlight.delete(key);
							controllers.delete(key);

							set("isFetching", false);

							return;
						}

						lastError = err;

						inFlight.delete(key);

						// retry with exponential backoff

						if (i < retry) {
							const delay = retryDelay * Math.pow(2, i);

							await new Promise((resolve) => {
								setTimeout(resolve, delay);
							});
						}
					}
				}

				controllers.delete(key);

				set("status", "error");
				set("error", lastError?.message || "Unknown error");
				set("isFetching", false);

				onError?.(lastError, args);

				throw lastError;
			},

			invalidate({ set }, args) {
				invalidateQueries(buildQueryKey(name, args));

				set("status", "idle");
				set("error", null);
			},

			reset({ set }) {
				set("data", null);
				set("status", "idle");
				set("error", null);
				set("isFetching", false);
				set("updatedAt", null);
			},
		},
	});

	// Cleanup (WeakMap - no public property pollution)

	queryCleanups.set(store, () => {
		// Cleanup matching controllers

		for (const [key, controller] of controllers.entries()) {
			if (key.startsWith(`${name}:`) || key === name) {
				controller.abort();
				controllers.delete(key);
			}
		}

		// Cleanup in-flight

		for (const key of inFlight.keys()) {
			if (key.startsWith(`${name}:`) || key === name) {
				inFlight.delete(key);
			}
		}

		// Cleanup cache

		for (const key of cache.keys()) {
			if (key.startsWith(`${name}:`) || key === name) {
				cache.delete(key);
			}
		}
	});

	return store;
}
