import { touch } from "./index.js";

const ARRAY_MUTATION_METHODS = new Set([
	"push",
	"pop",
	"shift",
	"unshift",
	"splice",
	"sort",
	"reverse",
	"fill",
	"copyWithin",
]);

const MAP_MUTATION_METHODS = new Set([
	"set",
	"delete",
	"clear",
]);

const SET_MUTATION_METHODS = new Set([
	"add",
	"delete",
	"clear",
]);

/**
 * Creates a reactive array wrapper that automatically notifies
 * dependents when the array is structurally mutated.
 *
 * Supported mutation methods:
 * - push
 * - pop
 * - shift
 * - unshift
 * - splice
 * - sort
 * - reverse
 * - fill
 * - copyWithin
 *
 * Direct array index and length assignments are also tracked.
 *
 * Deep mutations are not tracked:
 *
 * ```js
 * users[0].name = "John";
 * touch(this, "users");
 * ```
 *
 * @param {Array} array The array to wrap.
 * @param {Object} owner Reactive owner object.
 * @param {string} key Reactive property name.
 * @returns {Array} A reactive proxy around the array.
 */
export function reactiveArray(
	array,
	owner,
	key,
) {
	const methodCache = new Map();

	const proxy = new Proxy(array, {
		get(target, prop, receiver) {
			const value = Reflect.get(
				target,
				prop,
				receiver,
			);

			if (
				typeof value === "function" &&
				ARRAY_MUTATION_METHODS.has(prop)
			) {
				let wrapped = methodCache.get(prop);

				if (wrapped) {
					return wrapped;
				}

				wrapped = (...args) => {
					const result = value.apply(
						receiver,
						args,
					);

					touch(owner, key);

					return result;
				};

				methodCache.set(prop, wrapped);

				return wrapped;
			}

			return value;
		},

		/**
		 * Tracks direct structural writes to array indexes and length.
		 *
		 * Array mutation methods continue to notify explicitly through
		 * their wrappers above. The scheduler deduplicates any resulting
		 * notifications within the same microtask flush.
		 *
		 * @param {Array} target
		 * @param {string|symbol} prop
		 * @param {*} value
		 * @param {Object} receiver
		 * @returns {boolean}
		 */
		set(target, prop, value, receiver) {
			const result = Reflect.set(
				target,
				prop,
				value,
				receiver,
			);

			if (prop === "length") {
				touch(owner, key);
				return result;
			}

			// Numeric array index.
			const index =
				typeof prop === "string"
					? +prop
					: NaN;

			if (
				index === index &&
				index >= 0 &&
				(index | 0) === index
			) {
				touch(owner, key);
			}

			return result;
		},
	});

	Object.defineProperty(
		proxy,
		"__udodi_reactive__",
		{
			value: true,
			enumerable: false,
			configurable: false,
			writable: false,
		},
	);

	return proxy;
}

/**
 * Creates a reactive Map wrapper that automatically notifies
 * dependents when the Map is structurally mutated.
 *
 * Supported mutation methods:
 * - set
 * - delete
 * - clear
 *
 * Deep mutations are not tracked:
 *
 * ```js
 * map.get("user").name = "John";
 * touch(this, "map");
 * ```
 *
 * @param {Map} map The Map to wrap.
 * @param {Object} owner Reactive owner object.
 * @param {string} key Reactive property name.
 * @returns {Map} A reactive proxy around the Map.
 */
export function reactiveMap(
	map,
	owner,
	key,
) {
	const methodCache = new Map();

	const proxy = new Proxy(map, {
		get(target, prop, receiver) {
			const value = Reflect.get(
				target,
				prop,
				receiver,
			);

			if (
				typeof value === "function" &&
				MAP_MUTATION_METHODS.has(prop)
			) {
				let wrapped = methodCache.get(prop);

				if (wrapped) {
					return wrapped;
				}

				wrapped = (...args) => {
					const result = value.apply(
						target,
						args,
					);

					touch(owner, key);

					return result;
				};

				methodCache.set(prop, wrapped);

				return wrapped;
			}

			return value;
		},
	});

	Object.defineProperty(
		proxy,
		"__udodi_reactive__",
		{
			value: true,
			enumerable: false,
			configurable: false,
			writable: false,
		},
	);

	return proxy;
}

/**
 * Creates a reactive Set wrapper that automatically notifies
 * dependents when the Set is structurally mutated.
 *
 * Supported mutation methods:
 * - add
 * - delete
 * - clear
 *
 * Deep mutations are not tracked:
 *
 * ```js
 * set.forEach(user => {
 *     user.name = "John";
 * });
 *
 * touch(this, "set");
 * ```
 *
 * @param {Set} set The Set to wrap.
 * @param {Object} owner Reactive owner object.
 * @param {string} key Reactive property name.
 * @returns {Set} A reactive proxy around the Set.
 */
export function reactiveSet(
	set,
	owner,
	key,
) {
	const methodCache = new Map();

	const proxy = new Proxy(set, {
		get(target, prop, receiver) {
			const value = Reflect.get(
				target,
				prop,
				receiver,
			);

			if (
				typeof value === "function" &&
				SET_MUTATION_METHODS.has(prop)
			) {
				let wrapped = methodCache.get(prop);

				if (wrapped) {
					return wrapped;
				}

				wrapped = (...args) => {
					const result = value.apply(
						target,
						args,
					);

					touch(owner, key);

					return result;
				};

				methodCache.set(prop, wrapped);

				return wrapped;
			}

			return value;
		},
	});

	Object.defineProperty(
		proxy,
		"__udodi_reactive__",
		{
			value: true,
			enumerable: false,
			configurable: false,
			writable: false,
		},
	);

	return proxy;
}
