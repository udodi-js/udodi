import { createNamespace, store } from "./store.js";

const modules = new Map();

/**
 * @typedef {Object} StoreModuleContext
 * @property {Object} state Proxy for reading and writing module state.
 * @property {Function} get Read a module state key.
 * @property {Function} set Set a module state key.
 * @property {Function} update Update a module state key from its previous value.
 * @property {Function} touch Notify subscribers after mutating a value in place.
 * @property {Function} select Create a computed selector for module state.
 */

/**
 * @typedef {Object} StoreModuleDefinition
 * @property {Object} [state] Initial state values.
 * @property {Object<string, Function>} [actions] Action handlers.
 * @property {Function} [cleanup] Cleanup hook called when the module is destroyed.
 */

/**
 * Create a proxy that maps property access to a module namespace.
 *
 * @param {object} api
 * @param {Set<string>} stateKeys
 * @returns {Object}
 */
function createStateProxy(api, stateKeys) {
	return new Proxy(
		{},
		{
			get(_, key) {
				if (typeof key === "symbol") {
					return undefined;
				}

				return api.get(key);
			},

			set(_, key, value) {
				if (typeof key === "symbol") {
					return true;
				}

				api.set(key, value);

				return true;
			},

			deleteProperty(_, key) {
				if (typeof key === "symbol") {
					return true;
				}

				api.delete(key);

				return true;
			},

			has(_, key) {
				return (
					typeof key === "string" &&
					api.has(key)
				);
			},

			ownKeys() {
				return Array.from(stateKeys);
			},

			getOwnPropertyDescriptor(_, key) {
				if (
					typeof key === "string" &&
					stateKeys.has(key)
				) {
					return {
						enumerable: true,
						configurable: true,
						writable: true,
					};
				}

				return undefined;
			},
		},
	);
}

/**
 * Register a store module.
 *
 * @param {string} name
 * @param {StoreModuleDefinition} def
 * @returns {object}
 */
export function defineStore(name, def) {
	/**
	 * Prevent duplicate registration.
	 */
	if (modules.has(name)) {
		return modules.get(name);
	}

	const ns = createNamespace(name);

	const stateKeys = new Set(
		Object.keys(def.state || {}),
	);

	const selectorScope = {
		effects: [],
	};

	const api = {
		...ns,

		set(key, value) {
			stateKeys.add(key);
			ns.set(key, value);
		},

		update(key, fn) {
			stateKeys.add(key);
			ns.update(key, fn);
		},

		delete(key) {
			stateKeys.delete(key);
			ns.delete(key);
		},
	};

	/**
	 * Cached state proxy.
	 */
	const stateProxy = createStateProxy(
		api,
		stateKeys,
	);

	/**
	 * Initialize state.
	 */
	for (const key in def.state || {}) {
		api.set(
			key,
			def.state[key],
		);
	}

	/**
	 * Module API.
	 */
	const moduleApi = {
		...api,

		state: stateProxy,

		/**
		 * Create a lazily computed selector for module state.
		 *
		 * @param {Function} selector
		 * @param {{ effects: Function[] }=} [scope]
		 * @returns {Function}
		 */
		select(selector, scope) {
			return ns.select(
				() =>
					selector(
						stateProxy,
						moduleApi,
					),
				scope || selectorScope,
			);
		},

		/**
		 * Destroy module.
		 */
		destroy() {
			/**
			 * Optional cleanup hook.
			 */
			if (typeof def.cleanup === "function") {
				try {
					def.cleanup(moduleApi);
				} catch {}
			}

			/**
			 * Optional module-owned cleanup.
			 */
			if (
				typeof moduleApi.__cleanup ===
				"function"
			) {
				try {
					moduleApi.__cleanup();
				} catch {}
			}

			/**
			 * Remove module-owned selectors.
			 */
			for (const cleanup of selectorScope.effects) {
				cleanup();
			}

			selectorScope.effects.length = 0;

			/**
			 * Remove module state.
			 *
			 * ns.delete() also stops any persistence
			 * attached to the namespaced state keys.
			 */
			for (const key of Array.from(stateKeys)) {
				api.delete(key);
			}

			/**
			 * Remove actions.
			 */
			for (const key in def.actions || {}) {
				store.deleteAction(
					`${name}:${key}`,
				);
			}

			/**
			 * Remove module.
			 */
			modules.delete(name);
		},
	};

	/**
	 * Register actions.
	 */
	for (const key in def.actions || {}) {
		const actionName = `${name}:${key}`;

		store.defineAction(
			actionName,
			(payload) => {
				const ctx = {
					state: stateProxy,
					get: api.get,
					set: api.set,
					update: api.update,
					touch: api.touch,
					select: moduleApi.select,
				};

				return def.actions[key](
					ctx,
					payload,
				);
			},
		);
	}

	modules.set(
		name,
		moduleApi,
	);

	return moduleApi;
}

/**
 * Retrieve a registered store module by name.
 *
 * @param {string} name
 * @returns {object|undefined}
 */
export function useStore(name) {
	return modules.get(name);
}

/**
 * Destroy a store module and clean up its resources.
 *
 * @param {string} name
 */
export function destroyStore(name) {
	modules.get(name)?.destroy();
}
