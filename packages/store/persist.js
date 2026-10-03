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
		const unique = [];
		const seen = new Set();

		for (let i = 0, length = keys.length; i < length; i++) {
			const key = keys[i];

			if (!seen.has(key)) {
				seen.add(key);
				unique.push(key);
			}
		}

		return unique;
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
 * Hydrate persisted values into the store.
 *
 * Reads all configured keys using a single readonly transaction.
 *
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {string[]} keys
 * @param {string|undefined} prefix
 * @param {{set: Function}} api
 * @returns {Promise<void>}
 */
function hydrateState(db, storeName, keys, prefix, api) {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, "readonly");

		const objectStore = tx.objectStore(storeName);

		tx.oncomplete = () => {
			resolve();
		};

		tx.onerror = () => {
			reject(tx.error || new Error("IndexedDB hydration transaction failed."));
		};

		tx.onabort = () => {
			reject(tx.error || new Error("IndexedDB hydration transaction aborted."));
		};

		for (let i = 0, length = keys.length; i < length; i++) {
			const key = keys[i];

			const request = objectStore.get(
				toStorageKey(key, prefix),
			);

			request.onsuccess = () => {
				const value = request.result;

				if (value !== undefined) {
					api.set(key, value);
				}
			};
		}
	});
}

/**
 * Deep-clones persistable data.
 *
 * Supports primitives, arrays, plain objects, Date, Map and Set.
 * Preserves circular references, shared references, sparse arrays
 * and null-prototype objects.
 *
 * Unsupported object types throw a TypeError rather than silently
 * producing an incomplete clone.
 *
 * @param {any} value - Value to clone.
 * @param {WeakMap<object, any>} [seen] - Reference cache.
 * @returns {any} Deep clone of the supplied value.
 */
function toPersistable(value, seen) {
	// Primitives, functions, null and undefined
	if (value === null || typeof value !== "object") {
		return value;
	}

	// Initialize the reference cache only when necessary
	if (seen === undefined) {
		seen = new WeakMap();
	}

	// Preserve circular and shared references
	const cached = seen.get(value);
	if (cached !== undefined) {
		return cached;
	}

	// Arrays (including sparse)
	if (Array.isArray(value)) {
		const length = value.length;
		const clone = new Array(length);
		seen.set(value, clone);

		for (let i = 0; i < length; i++) {
			if (i in value) {
				clone[i] = toPersistable(value[i], seen);
			}
		}
		return clone;
	}

	// Date
	if (value instanceof Date) {
		const clone = new Date(value.getTime());
		seen.set(value, clone);
		return clone;
	}

	// Map
	if (value instanceof Map) {
		const clone = new Map();
		seen.set(value, clone);

		for (const [key, item] of value) {
			clone.set(
				toPersistable(key, seen),
				toPersistable(item, seen),
			);
		}

		return clone;
	}

	// Set
	if (value instanceof Set) {
		const clone = new Set();
		seen.set(value, clone);

		for (const item of value) {
			clone.add(toPersistable(item, seen));
		}

		return clone;
	}

	// Plain objects (including null-prototype)
	const prototype = Object.getPrototypeOf(value);

	if (prototype !== Object.prototype && prototype !== null) {
		throw new TypeError("Cannot persist unsupported object type");
	}

	const clone = Object.create(prototype);
	seen.set(value, clone);

	const keys = Object.keys(value);
	const len = keys.length;

	for (let i = 0; i < len; i++) {
		const key = keys[i];
		const clonedValue = toPersistable(value[key], seen);

		// Avoid the special __proto__ setter
		if (key === "__proto__") {
			Object.defineProperty(clone, key, {
				value: clonedValue,
				writable: true,
				enumerable: true,
				configurable: true,
			});
			
		} else {
			clone[key] = clonedValue;
		}
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
		globalThis.console?.warn?.("[store.persist] IndexedDB is not available.");

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

		globalThis.console?.warn?.("[store.persist] IndexedDB error:", error);
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
		if (db === null || pending.size === 0) {
			return true;
		}

		/**
		 * Snapshot pending values before clearing the queue.
		 *
		 * A new value for the same key may be queued while this
		 * transaction is running. That newer value must not be
		 * overwritten when an older transaction fails.
		 */
		const entries = Array.from(pending.entries());

		pending.clear();

		try {
			/**
			 * Use one transaction for the entire batch.
			 *
			 * This is substantially cheaper than creating one
			 * readwrite transaction per key.
			 */
			const tx = db.transaction(storeName, "readwrite");

			const objectStore = tx.objectStore(storeName);

			const txPromise = new Promise((resolve, reject) => {
				tx.oncomplete = () => {
					resolve(true);
				};

				tx.onerror = () => {
					reject(tx.error || new Error("IndexedDB transaction failed."));
				};

				tx.onabort = () => {
					reject(tx.error || new Error("IndexedDB transaction aborted."));
				};
			});

			for (let i = 0, length = entries.length; i < length; i++) {
				const key = entries[i][0];
				const value = entries[i][1];

				const storageKey = toStorageKey(key, _prefix);

				if (removeOnUndefined && value === undefined) {
					objectStore.delete(storageKey);
				} else {
					objectStore.put(toPersistable(value), storageKey);
				}
			}

			await txPromise;
			return true;

		} catch (error) {
			/**
			 * Re-queue failed values only when the key has not
			 * received a newer pending value.
			 *
			 * This prevents an older failed write from replacing
			 * a newer value queued while the transaction was running.
			 */
			for (let i = 0, length = entries.length; i < length; i++) {
				const key = entries[i][0];
				const value = entries[i][1];

				if (!pending.has(key)) {
					pending.set(key, value);
				}
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
				await hydrateState(
					db,
					storeName,
					localKeys,
					_prefix,
					api,
				);
			}

			if (stopped) {
				return false;
			}

			for (let i = 0, length = localKeys.length; i < length; i++) {
				const key = localKeys[i];

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

		}).catch((error) => {
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
				if (db === null) {
					return false;
				}

				cancelScheduledWrite();
				pending.clear();

				try {
					/**
					 * Use one transaction for all delete operations.
					 *
					 * This avoids creating one IndexedDB transaction
					 * for every persisted key.
					 */
					const tx = db.transaction(
						storeName,
						"readwrite",
					);

					const objectStore = tx.objectStore(
						storeName,
					);

					const txPromise = new Promise(
						(resolve, reject) => {
							tx.oncomplete = () => {
								resolve(true);
							};

							tx.onerror = () => {
								reject(tx.error || new Error("IndexedDB transaction failed."));
							};

							tx.onabort = () => {
								reject(tx.error || new Error("IndexedDB transaction aborted."));
							};
						},
					);

					for (let i = 0, length = localKeys.length; i < length; i++) {
						objectStore.delete(
							toStorageKey(
								localKeys[i],
								_prefix,
							),
						);
					}

					await txPromise;
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

			for (let i = 0, length = cleanups.length; i < length; i++) {
				try {
					cleanups[i]();
				} catch {}
			}

			cleanups.length = 0;
		},
	};
}
