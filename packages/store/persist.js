const DEFAULT_DB_NAME = "udodi-store";
const DEFAULT_STORE_NAME = "state";

/** @type {Map<string, Promise<IDBDatabase>>} */
const dbCache = new Map();

/**
 * @typedef {Object} PersistOptions
 * @property {string} [dbName] IndexedDB database name.
 * @property {string} [storeName] IndexedDB object store name.
 * @property {boolean} [hydrate] Whether to restore saved values before subscribing.
 * @property {boolean} [removeOnUndefined] Whether undefined removes persisted values.
 * @property {number} [debounce] Delay writes by this many milliseconds.
 * @property {Function} [onError] Error callback.
 * @property {string} [_prefix] Internal key prefix.
 */

/**
 * @typedef {Object} PersistController
 * @property {string[]} keys Persisted local keys.
 * @property {Promise<boolean>} ready Resolves after IndexedDB opens and hydration runs.
 * @property {Function} flush Write pending values immediately.
 * @property {Function} clear Remove persisted values for these keys.
 * @property {Function} stop Stop syncing future changes.
 */

/**
 * Normalize a persistence key list.
 *
 * @param {string|string[]} keys
 * @returns {string[]}
 */
function normalizeKeys(keys) {
	if (Array.isArray(keys)) {
		return [...new Set(keys)];
	}

	return [keys];
}

/**
 * Check whether IndexedDB is available.
 *
 * @returns {boolean}
 */
function hasIndexedDB() {
	return typeof globalThis.indexedDB !== "undefined";
}

/**
 * Convert a local key into its persisted storage key.
 *
 * @param {string} key
 * @param {string|undefined} prefix
 * @returns {string}
 */
function toStorageKey(key, prefix) {
	return prefix ? `${prefix}:${key}` : key;
}

/**
 * Convert an IndexedDB request into a Promise.
 *
 * @param {IDBRequest} request
 * @returns {Promise<any>}
 */
function requestToPromise(request) {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Open or reuse an IndexedDB database.
 *
 * @param {string} dbName
 * @param {string} storeName
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase(dbName, storeName) {
	const cacheKey = `${dbName}:${storeName}`;
	const cached = dbCache.get(cacheKey);

	if (cached) {
		return cached;
	}

	const promise = new Promise((resolve, reject) => {
		const request = globalThis.indexedDB.open(dbName, 1);

		request.onupgradeneeded = () => {
			const db = request.result;

			if (!db.objectStoreNames.contains(storeName)) {
				db.createObjectStore(storeName);
			}
		};

		request.onsuccess = () => {
			resolve(request.result);
		};

		request.onerror = () => {
			reject(request.error);
		};
	});

	dbCache.set(cacheKey, promise);

	return promise;
}

/**
 * Read a persisted value.
 *
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {string} key
 * @returns {Promise<any>}
 */
function readValue(db, storeName, key) {
	const tx = db.transaction(storeName, "readonly");

	return requestToPromise(
		tx.objectStore(storeName).get(key),
	);
}

/**
 * Write a persisted value.
 *
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {string} key
 * @param {any} value
 * @returns {Promise<any>}
 */
function writeValue(db, storeName, key, value) {
	const tx = db.transaction(storeName, "readwrite");

	return requestToPromise(
		tx.objectStore(storeName).put(value, key),
	);
}

/**
 * Remove a persisted value.
 *
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {string} key
 * @returns {Promise<any>}
 */
function removeValue(db, storeName, key) {
	const tx = db.transaction(storeName, "readwrite");

	return requestToPromise(
		tx.objectStore(storeName).delete(key),
	);
}

/**
 * Convert reactive/proxied values into structured-clone-friendly values.
 *
 * @param {any} value
 * @param {WeakMap<object, any>} [seen]
 * @returns {any}
 */
function toPersistable(value, seen = new WeakMap()) {
	if (value === null || typeof value !== "object") {
		return value;
	}

	if (value instanceof Date) {
		return new Date(value.getTime());
	}

	if (seen.has(value)) {
		return seen.get(value);
	}

	if (Array.isArray(value)) {
		const clone = [];

		seen.set(value, clone);

		for (let i = 0; i < value.length; i++) {
			clone[i] = toPersistable(value[i], seen);
		}

		return clone;
	}

	if (value instanceof Map) {
		const clone = new Map();

		seen.set(value, clone);

		for (const [key, entryValue] of value.entries()) {
			clone.set(
				toPersistable(key, seen),
				toPersistable(entryValue, seen),
			);
		}

		return clone;
	}

	if (value instanceof Set) {
		const clone = new Set();

		seen.set(value, clone);

		for (const entryValue of value.values()) {
			clone.add(toPersistable(entryValue, seen));
		}

		return clone;
	}

	const clone = {};

	seen.set(value, clone);

	for (const key of Object.keys(value)) {
		clone[key] = toPersistable(value[key], seen);
	}

	return clone;
}

/**
 * Create an inactive persistence controller.
 *
 * @param {string[]} keys
 * @returns {PersistController}
 */
function inactiveController(keys) {
	const ready = Promise.resolve(false);

	return {
		keys,
		ready,
		flush: () => ready,
		clear: () => ready,
		stop() {},
	};
}

/**
 * Persist store keys into IndexedDB.
 *
 * Persistence is opt-in and does not change the synchronous store API.
 * Hydration completes through the returned `ready` Promise.
 *
 * @param {{get: Function, set: Function, subscribe: Function}} api
 * Store-like API.
 * @param {string|string[]} keys
 * Keys to persist.
 * @param {PersistOptions} [options]
 * Persistence options.
 * @returns {PersistController}
 */
export function persistStore(api, keys, options = {}) {
	const localKeys = normalizeKeys(keys);

	const {
		dbName = DEFAULT_DB_NAME,
		storeName = DEFAULT_STORE_NAME,
		hydrate = true,
		removeOnUndefined = true,
		debounce = 0,
		onError,
		_prefix,
	} = options;

	if (localKeys.length === 0) {
		return inactiveController(localKeys);
	}

	if (!hasIndexedDB()) {
		globalThis.console?.warn?.(
			"[store.persist] IndexedDB is not available.",
		);

		return inactiveController(localKeys);
	}

	let db = null;
	let stopped = false;
	let timer = null;

	/** @type {Function[]} */
	const cleanups = [];

	/** @type {Map<string, any>} */
	const pending = new Map();

	const reportError = (error) => {
		if (typeof onError === "function") {
			onError(error);
			return;
		}

		globalThis.console?.warn?.(
			"[store.persist] IndexedDB error:",
			error,
		);
	};

	/**
	 * Cancel a scheduled write.
	 */
	const cancelScheduledWrite = () => {
		if (timer !== null && timer !== true) {
			clearTimeout(timer);
		}

		timer = null;
	};

	/**
	 * Write all pending values.
	 *
	 * @returns {Promise<boolean>}
	 */
	const writePending = async () => {
		if (!db || pending.size === 0) {
			return true;
		}

		const entries = Array.from(pending.entries());

		pending.clear();

		try {
			for (const [key, value] of entries) {
				const storageKey = toStorageKey(key, _prefix);

				if (
					removeOnUndefined &&
					value === undefined
				) {
					await removeValue(
						db,
						storeName,
						storageKey,
					);
				} else {
					await writeValue(
						db,
						storeName,
						storageKey,
						toPersistable(value),
					);
				}
			}

			return true;
			
		} catch (error) {
			/**
			 * Re-queue failed values so a later flush can retry them.
			 */
			for (const [key, value] of entries) {
				pending.set(key, value);
			}

			reportError(error);

			return false;
		}
	};

	/**
	 * Schedule a value for persistence.
	 *
	 * @param {string} key
	 * @param {any} value
	 */
	const scheduleWrite = (key, value) => {
		if (stopped) {
			return;
		}

		pending.set(key, value);

		if (timer !== null) {
			return;
		}

		if (debounce > 0) {
			timer = setTimeout(() => {
				timer = null;
				writePending();
			}, debounce);

			return;
		}

		timer = true;

		queueMicrotask(() => {
			timer = null;
			writePending();
		});
	};

	/**
	 * Open the database, hydrate state, then subscribe.
	 *
	 * The subscription is intentionally registered only after hydration
	 * to prevent restored values from being immediately overwritten.
	 */
	const ready = openDatabase(dbName, storeName)
		.then(async (opened) => {
			db = opened;

			if (hydrate) {
				for (const key of localKeys) {
					const storageKey = toStorageKey(
						key,
						_prefix,
					);

					const value = await readValue(
						db,
						storeName,
						storageKey,
					);

					if (value !== undefined) {
						api.set(key, value);
					}
				}
			}

			if (stopped) {
				return false;
			}

			for (const key of localKeys) {
				const cleanup = api.subscribe(
					key,
					(value) => {
						scheduleWrite(key, value);
					},
				);

				if (typeof cleanup === "function") {
					cleanups.push(cleanup);
				}
			}

			return true;
		})
		.catch((error) => {
			reportError(error);
			return false;
		});

	return {
		keys: localKeys,

		ready,

		/**
		 * Immediately persist pending changes.
		 *
		 * @returns {Promise<boolean>}
		 */
		async flush() {
			return ready.then(() => {
				cancelScheduledWrite();

				return writePending();
			});
		},

		/**
		 * Remove persisted values for the configured keys.
		 *
		 * Persistence remains active after clear().
		 *
		 * @returns {Promise<boolean>}
		 */
		async clear() {
			return ready.then(async () => {
				if (!db) {
					return false;
				}

				cancelScheduledWrite();
				pending.clear();

				try {
					for (const key of localKeys) {
						await removeValue(
							db,
							storeName,
							toStorageKey(key, _prefix),
						);
					}

					return true;
					
				} catch (error) {
					reportError(error);

					return false;
				}
			});
		},

		/**
		 * Stop persistence subscriptions.
		 *
		 * Persisted data already stored in IndexedDB is retained.
		 */
		stop() {
			if (stopped) {
				return;
			}

			stopped = true;

			cancelScheduledWrite();

			/**
			 * Do not silently discard values that were already queued.
			 * The controller is stopped, so no new values will be queued.
			 */
			pending.clear();

			for (const cleanup of cleanups) {
				try {
					cleanup();
				} catch {}
			}

			cleanups.length = 0;
		},
	};
}
