import {
	computed,
	effect,
	reactive,
	touch as touchReactive,
} from "../reactivity/index.js";

import { persistStore } from "./persist.js";

/**
 * @typedef {Object} StoreEntry
 * @property {{ value: any }} state Reactive holder for subscriber tracking.
 * @property {any} value Current raw store value used for non-tracking reads.
 */

/** @type {Map<string, StoreEntry>} */
const state = new Map();

/** @type {Map<string, Function>} */
const actions = new Map();

/** @type {Map<string, Set<Object>>} */
const persistence = new Map();

const devtools = globalThis.__STORE_DEVTOOLS__ || null;

/**
 * Emit devtools events.
 *
 * @param {string} event
 * @param {any} payload
 */
function emit(event, payload) {
	devtools?.emit?.(event, payload);
}

/**
 * Handles dispatch attempts for actions that have not been registered.
 *
 * @param {string} name
 * @param {{ throwOnMissing?: boolean, strict?: boolean }=} options
 * @returns {undefined}
 */
function missingAction(name, options) {
	const message = `[store] Missing action: ${name}`;

	emit("action:missing", {
		name,
	});

	if (options?.throwOnMissing || options?.strict) {
		throw new Error(message);
	}

	globalThis.console?.warn?.(message);

	return undefined;
}

// Batching

let batchDepth = 0;

/** @type {Map<string, any>} */
const pendingValues = new Map();

/** @type {Set<string>} */
const pendingDeletes = new Set();

/**
 * Creates a reactive holder for a store value.
 *
 * @param {any} value
 * @returns {StoreEntry}
 */
function createEntry(value) {
	const holder = reactive({ value });

	return {
		state: holder,
		value: holder.value,
	};
}

/**
 * Reads the currently staged value for a key without tracking.
 *
 * @param {string} key
 * @returns {any}
 */
function peek(key) {
	if (pendingValues.has(key)) {
		return pendingValues.get(key);
	}

	return state.get(key)?.value;
}

/**
 * Commits a value to the reactive holder.
 *
 * @param {string} key
 * @param {any} value
 * @returns {StoreEntry}
 */
function commit(key, value) {
	let entry = state.get(key);

	if (!entry) {
		entry = createEntry(value);
		state.set(key, entry);

		return entry;
	}

	entry.state.value = value;
	entry.value = entry.state.value;

	return entry;
}

/**
 * Commits all staged batch changes.
 */
function flushBatch() {
	const values = Array.from(pendingValues.entries());
	const deletes = new Set(pendingDeletes);

	pendingValues.clear();
	pendingDeletes.clear();

	for (const [key, value] of values) {
		commit(key, value);

		if (deletes.has(key)) {
			state.delete(key);
		}
	}
}

/**
 * Batch updates within a single transaction.
 *
 * @param {Function} fn
 */
export function batch(fn) {
	batchDepth++;

	try {
		return fn();
	} finally {
		batchDepth--;

		if (batchDepth === 0) {
			flushBatch();
		}
	}
}

/**
 * Register a persistence controller for a state key.
 *
 * @param {string} key
 * @param {Object} controller
 */
function registerPersistence(key, controller) {
	let controllers = persistence.get(key);

	if (!controllers) {
		controllers = new Set();
		persistence.set(key, controllers);
	}

	controllers.add(controller);
}

/**
 * Remove a persistence controller from tracking.
 *
 * @param {string} key
 * @param {Object} controller
 */
function unregisterPersistence(key, controller) {
	const controllers = persistence.get(key);

	if (!controllers) {
		return;
	}

	controllers.delete(controller);

	if (controllers.size === 0) {
		persistence.delete(key);
	}
}

/**
 * Stop persistence controllers associated with a key.
 *
 * @param {string} key
 */
function stopPersistence(key) {
	const controllers = persistence.get(key);

	if (!controllers) {
		return;
	}

	for (const controller of controllers) {
		controller.stop();
	}

	persistence.delete(key);
}

// Store Core

export const store = {
	/**
	 * Get value.
	 *
	 * @param {string} key
	 * @returns {any}
	 */
	get(key) {
		if (pendingValues.has(key)) {
			return pendingValues.get(key);
		}

		let entry = state.get(key);

		if (!entry) {
			entry = createEntry(undefined);
			state.set(key, entry);
		}

		return entry.state.value;
	},

	/**
	 * Set value.
	 *
	 * @param {string} key
	 * @param {any} value
	 */
	set(key, value) {
		const prev = peek(key);

		if (Object.is(prev, value)) {
			return;
		}

		if (batchDepth > 0) {
			pendingValues.set(key, value);
			pendingDeletes.delete(key);
		} else {
			commit(key, value);
		}

		emit("set", {
			key,
			prev,
			value,
		});
	},

	/**
	 * Update value from its previous value.
	 *
	 * @param {string} key
	 * @param {Function} fn
	 */
	update(key, fn) {
		this.set(key, fn(this.get(key)));
	},

	/**
	 * Notify subscribers after mutating a stored object in place.
	 *
	 * @param {string} key
	 * @returns {boolean}
	 */
	touch(key) {
		const entry = state.get(key);

		if (!entry) {
			return false;
		}

		return touchReactive(entry.state, "value");
	},

	/**
	 * Persist one or more store keys into IndexedDB.
	 *
	 * Persistence is opt-in. The store itself remains synchronous.
	 *
	 * @param {string|string[]} keys
	 * @param {import("./persist.js").PersistOptions} [options]
	 * @returns {import("./persist.js").PersistController}
	 */
	persist(keys, options) {
		const controller = persistStore(
			this,
			keys,
			options,
		);

		for (const key of controller.keys) {
			registerPersistence(key, controller);
		}

		return controller;
	},

	defineAction(name, fn) {
		actions.set(
			name,

			async (payload) => {
				emit("action:start", {
					name,
				});

				try {
					const result = await fn(payload, store);

					emit("action:end", {
						name,
					});

					return result;

				} catch (err) {
					emit("action:error", {
						name,
						err,
					});

					throw err;
				}
			},
		);
	},

	/**
	 * Dispatch an action by name.
	 *
	 * @param {string} name
	 * @param {any} [payload]
	 * @param {{ throwOnMissing?: boolean, strict?: boolean }=} [options]
	 * @returns {Promise<any>|undefined}
	 */
	dispatch(name, payload, options) {
		const action = actions.get(name);

		if (!action) {
			return missingAction(name, options);
		}

		return action(payload);
	},

	/**
	 * Create a lazily computed store selector.
	 *
	 * @param {Function} selector
	 * @param {{ effects: Function[] }=} [scope]
	 * @returns {Function}
	 */
	select(selector, scope) {
		return computed(() => selector(store), scope);
	},

	/**
	 * Subscribe to a store key.
	 *
	 * @param {string} key
	 * @param {Function} cb
	 * @returns {Function}
	 */
	subscribe(key, cb) {
		let prev;
		let initialized = false;

		return effect(() => {
			const next = this.get(key);

			if (!initialized) {
				initialized = true;

				if (next !== undefined) {
					cb(next, prev);
				}

				prev = next;

				return;
			}

			if (!Object.is(next, prev)) {
				cb(next, prev);
				prev = next;

				return;
			}

			cb(next, prev);
			prev = next;
		});
	},

	/**
	 * Get all state keys.
	 *
	 * @returns {string[]}
	 */
	keys() {
		const keys = new Set(state.keys());

		for (const key of pendingValues.keys()) {
			if (pendingDeletes.has(key)) {
				keys.delete(key);
			} else {
				keys.add(key);
			}
		}

		return Array.from(keys);
	},

	/**
	 * Remove state key.
	 *
	 * @param {string} key
	 */
	delete(key) {
		const hadKey =
			state.has(key) ||
			pendingValues.has(key);

		if (!hadKey) {
			return;
		}

		stopPersistence(key);

		if (batchDepth > 0) {
			pendingValues.set(key, undefined);
			pendingDeletes.add(key);
		} else {
			commit(key, undefined);
			state.delete(key);
		}

		emit("delete", { key });
	},

	/**
	 * Remove action.
	 *
	 * @param {string} name
	 */
	deleteAction(name) {
		actions.delete(name);

		emit("action:delete", {
			name,
		});
	},

	/**
	 * Check state existence.
	 *
	 * @param {string} key
	 * @returns {boolean}
	 */
	has(key) {
		if (pendingDeletes.has(key)) {
			return false;
		}

		if (pendingValues.has(key)) {
			return true;
		}

		return state.has(key);
	},

	/**
	 * Check action existence.
	 *
	 * @param {string} name
	 * @returns {boolean}
	 */
	hasAction(name) {
		return actions.has(name);
	},

	/**
	 * Clear all state and actions.
	 */
	clear() {
		for (const key of state.keys()) {
			stopPersistence(key);
			commit(key, undefined);
		}

		state.clear();
		actions.clear();
		pendingValues.clear();
		pendingDeletes.clear();
		persistence.clear();

		emit("clear");
	},
};

/**
 * Create a namespaced store helper.
 *
 * @param {string} ns
 * @returns {object}
 */
export function createNamespace(ns) {
	const k = (key) => `${ns}:${key}`;

	const api = {
		get: (key) => store.get(k(key)),

		set: (key, value) => store.set(k(key), value),

		update: (key, fn) => store.update(k(key), fn),

		touch: (key) => store.touch(k(key)),

		subscribe: (key, callback) =>
			store.subscribe(k(key), callback),

		dispatch: (action, payload, options) =>
			store.dispatch(
				`${ns}:${action}`,
				payload,
				options,
			),

		select: (selector, scope) =>
			computed(
				() => selector(api),
				scope,
			),

		/**
		 * Persist namespace keys.
		 *
		 * The caller uses local keys while the underlying store
		 * persists the fully qualified namespace keys.
		 *
		 * @param {string|string[]} keys
		 * @param {import("./persist.js").PersistOptions} [options]
		 * @returns {import("./persist.js").PersistController}
		 */
		persist: (keys, options = {}) => {
			const localKeys = Array.isArray(keys)
				? keys
				: [keys];

			const controller = persistStore(
				api,
				localKeys,
				{
					...options,
					_prefix: ns,
				},
			);

			for (const key of localKeys) {
				registerPersistence(
					k(key),
					controller,
				);
			}

			return controller;
		},

		delete: (key) =>
			store.delete(k(key)),

		has: (key) =>
			store.has(k(key)),

		hasAction: (action) =>
			store.hasAction(`${ns}:${action}`),
	};

	return api;
}
