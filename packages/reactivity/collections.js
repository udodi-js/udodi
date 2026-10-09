import { touch } from "./index.js";

/**
 * Returns true when `prop` is an Array method that structurally mutates.
 *
 * @param {PropertyKey} prop
 * @returns {boolean}
 */
function isArrayMutationMethod(prop) {
	switch (prop) {
		case "push":
		case "pop":
		case "shift":
		case "unshift":
		case "splice":
		case "sort":
		case "reverse":
		case "fill":
		case "copyWithin":
			return true;
		default:
			return false;
	}
}

/**
 * Returns true when `prop` is a Map method that structurally mutates.
 *
 * @param {PropertyKey} prop
 * @returns {boolean}
 */
function isMapMutationMethod(prop) {
	return prop === "set" || prop === "delete" || prop === "clear";
}

/**
 * Returns true when `prop` is a Set method that structurally mutates.
 *
 * @param {PropertyKey} prop
 * @returns {boolean}
 */
function isSetMutationMethod(prop) {
	return prop === "add" || prop === "delete" || prop === "clear";
}

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

	const index = +prop;

	return (
		index === (index >>> 0) && 
		index !== 0xffffffff && 
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
 * - push, pop, shift, unshift, splice, sort, reverse, fill, copyWithin
 *
 * Direct array index and `length` assignments are also tracked.
 *
 * Mutation methods are invoked against the underlying array rather than the
 * proxy so internal index/length writes do not double-notify via the `set` trap.
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
	/** @type {Object<string, Function>} */
	const methodCache = Object.create(null);

	const proxy = new Proxy(array, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);

			if (typeof value === "function" && isArrayMutationMethod(prop)) {
				const cached = methodCache[prop];

				if (cached !== undefined) {
					return cached;
				}

				const wrapped = (...args) => {
					const result = value.apply(target, args);
					touch(owner, key);
					return result;
				};

				methodCache[prop] = wrapped;
				return wrapped;
			}

			return value;
		},

		/**
		 * Tracks direct structural writes to array indexes and `length`.
		 *
		 * Mutation methods run against the underlying array via their wrappers,
		 * so their internal writes do not reach this trap.
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
 * Shared reactive wrapper for Map and Set.
 *
 * Native methods are always bound to the underlying collection because Map/Set
 * operations depend on internal slots that a Proxy does not possess.
 *
 * @param {Map|Set} collection - Underlying Map or Set.
 * @param {Object} owner - Reactive owner object.
 * @param {PropertyKey} key - Reactive property name.
 * @param {(prop: PropertyKey) => boolean} isMutationMethod - Mutation predicate.
 * @returns {Map|Set} Reactive proxy around the collection.
 */
function reactiveCollection(collection, owner, key, isMutationMethod) {
	/** @type {Object<string, Function>} */
	const methodCache = Object.create(null);

	const proxy = new Proxy(collection, {
		get(target, prop) {
			const value = Reflect.get(target, prop, target);

			if (typeof value !== "function") {
				return value;
			}

			const cached = methodCache[prop];

			if (cached !== undefined) {
				return cached;
			}

			const wrapped = isMutationMethod(prop) 
				? (...args) => {
						const result = value.apply(target, args);
						touch(owner, key);
						return result;
					}
				: value.bind(target);

			methodCache[prop] = wrapped;
			return wrapped;
		},
	});

	markReactive(proxy);
	return proxy;
}

/**
 * Creates a reactive Map wrapper that automatically notifies dependents
 * when the Map is structurally mutated.
 *
 * Supported mutation methods: set, delete, clear.
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
	return reactiveCollection(map, owner, key, isMapMutationMethod);
}

/**
 * Creates a reactive Set wrapper that automatically notifies dependents
 * when the Set is structurally mutated.
 *
 * Supported mutation methods: add, delete, clear.
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
	return reactiveCollection(set, owner, key, isSetMutationMethod);
}
