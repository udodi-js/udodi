import { touch } from "./index.js";

/**
 * Array methods that structurally mutate the wrapped array.
 *
 * @type {Set<string>}
 */
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

/**
 * Map methods that structurally mutate the wrapped Map.
 *
 * @type {Set<string>}
 */
const MAP_MUTATION_METHODS = new Set([
	"set",
	"delete",
	"clear",
]);

/**
 * Set methods that structurally mutate the wrapped Set.
 *
 * @type {Set<string>}
 */
const SET_MUTATION_METHODS = new Set([
	"add",
	"delete",
	"clear",
]);

/**
 * Determines whether a property name is a valid array index.
 *
 * Array indexes are integer property keys in the range 0 through
 * 2^32 - 2. The `length` property is handled separately.
 *
 * @param {PropertyKey} prop - Property key to inspect.
 * @returns {boolean} True when the property is an array index.
 */
function isArrayIndex(prop) {
	if (typeof prop !== "string" || prop === "") {
		return false;
	}

	const index = Number(prop);

	return (
		Number.isInteger(index) &&
		index >= 0 &&
		index < 0xffffffff &&
		String(index) === prop
	);
}

/**
 * Marks a wrapped collection as reactive.
 *
 * The marker is non-enumerable and immutable so collection wrappers can be
 * recognized without exposing framework metadata during normal iteration.
 *
 * @param {Object} proxy - Reactive collection proxy.
 * @returns {void}
 */
function markReactive(proxy) {
	Object.defineProperty(proxy, "__udodi_reactive__", {
		value: true,
		enumerable: false,
		configurable: false,
		writable: false,
	});
}

/**
 * Creates a reactive array wrapper that automatically notifies dependents
 * when the array is structurally mutated.
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
 * Direct array index and `length` assignments are also tracked.
 *
 * Mutation methods are invoked against the underlying array rather than the
 * proxy. This prevents the native method's internal index/length writes from
 * passing through the proxy `set` trap and causing duplicate notifications.
 *
 * Deep mutations are not tracked:
 *
 * ```js
 * users[0].name = "John";
 * touch(this, "users");
 * ```
 *
 * @param {Array} array - The array to wrap.
 * @param {Object} owner - Reactive owner object.
 * @param {PropertyKey} key - Reactive property name.
 * @returns {Array} A reactive proxy around the array.
 */
export function reactiveArray(array, owner, key) {
	const methodCache = new Map();

	const proxy = new Proxy(array, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);

			if (
				typeof value === "function" &&
				ARRAY_MUTATION_METHODS.has(prop)
			) {
				let wrapped = methodCache.get(prop);

				if (wrapped) {
					return wrapped;
				}

				wrapped = (...args) => {
					const result = value.apply(target, args);
					touch(owner, key);

					return result;
				};

				methodCache.set(prop, wrapped);

				return wrapped;
			}

			return value;
		},

		/**
		 * Tracks direct structural writes to array indexes and `length`.
		 *
		 * Mutation methods are executed against the underlying array by their
		 * wrappers above, so their internal writes do not reach this trap.
		 *
		 * @param {Array} target - Underlying array.
		 * @param {string|symbol} prop - Property being written.
		 * @param {*} value - New property value.
		 * @param {Object} receiver - Proxy receiver.
		 * @returns {boolean} Whether the assignment succeeded.
		 */
		set(target, prop, value, receiver) {
			const result = Reflect.set(target, prop, value, receiver);

			if (!result) {
				return false;
			}

			if (prop === "length" || isArrayIndex(prop)) {
				touch(owner, key);
			}

			return true;
		},
	});

	markReactive(proxy);

	return proxy;
}

/**
 * Creates a reactive Map wrapper that automatically notifies dependents
 * when the Map is structurally mutated.
 *
 * Supported mutation methods:
 * - set
 * - delete
 * - clear
 *
 * Native Map methods and accessors are always evaluated against the underlying
 * Map. This is required because Map operations depend on the Map's internal
 * `[[MapData]]` slot, which a Proxy does not possess.
 *
 * Deep mutations are not tracked:
 *
 * ```js
 * map.get("user").name = "John";
 * touch(this, "map");
 * ```
 *
 * @param {Map} map - The Map to wrap.
 * @param {Object} owner - Reactive owner object.
 * @param {PropertyKey} key - Reactive property name.
 * @returns {Map} A reactive proxy around the Map.
 */
export function reactiveMap(map, owner, key) {
	const methodCache = new Map();

	const proxy = new Proxy(map, {
		get(target, prop) {
			const value = Reflect.get(target, prop, target);

			if (typeof value !== "function") {
				return value;
			}

			let wrapped = methodCache.get(prop);

			if (wrapped) {
				return wrapped;
			}

			if (MAP_MUTATION_METHODS.has(prop)) {
				wrapped = (...args) => {
					const result = value.apply(target, args);
					touch(owner, key);

					return result;
				};
			} else {
				wrapped = value.bind(target);
			}

			methodCache.set(prop, wrapped);

			return wrapped;
		},
	});

	markReactive(proxy);

	return proxy;
}

/**
 * Creates a reactive Set wrapper that automatically notifies dependents
 * when the Set is structurally mutated.
 *
 * Supported mutation methods:
 * - add
 * - delete
 * - clear
 *
 * Native Set methods and accessors are always evaluated against the underlying
 * Set. This is required because Set operations depend on the Set's internal
 * `[[SetData]]` slot, which a Proxy does not possess.
 *
 * Deep mutations are not tracked:
 *
 * ```js
 * set.forEach(user => {
 * 	user.name = "John";
 * });
 * touch(this, "set");
 * ```
 *
 * @param {Set} set - The Set to wrap.
 * @param {Object} owner - Reactive owner object.
 * @param {PropertyKey} key - Reactive property name.
 * @returns {Set} A reactive proxy around the Set.
 */
export function reactiveSet(set, owner, key) {
	const methodCache = new Map();

	const proxy = new Proxy(set, {
		get(target, prop) {
			const value = Reflect.get(target, prop, target);

			if (typeof value !== "function") {
				return value;
			}

			let wrapped = methodCache.get(prop);

			if (wrapped) {
				return wrapped;
			}

			if (SET_MUTATION_METHODS.has(prop)) {
				wrapped = (...args) => {
					const result = value.apply(target, args);
					touch(owner, key);

					return result;
				};
			} else {
				wrapped = value.bind(target);
			}

			methodCache.set(prop, wrapped);

			return wrapped;
		},
	});

	markReactive(proxy);

	return proxy;
}
