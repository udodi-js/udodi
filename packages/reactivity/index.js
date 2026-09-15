/**
 * Queue of scheduled reactive jobs.
 *
 * A Set is used to automatically deduplicate jobs within
 * the same microtask flush.
 *
 * @type {Set<Function>}
 */
const jobQueue = new Set();

/**
 * Whether a flush has already been scheduled.
 *
 * @type {boolean}
 */
let isFlushing = false;

/**
 * Reusable buffer for job batching.
 *
 * High-water mark buffer avoids repeated allocation during flush.
 * Entries are cleared (set to null) after execution.
 *
 * @type {Function[]}
 */
const jobBuffer = [];

/**
 * Schedules a reactive job for execution.
 *
 * Jobs are batched and executed in a microtask.
 * Duplicate jobs are ignored automatically.
 *
 * @param {Function} job
 */
function schedule(job) {
	if (jobQueue.has(job)) return;

	jobQueue.add(job);

	// Lock it immediately so no other microtasks can be scheduled
	// during this synchronous execution block.
	if (!isFlushing) {
		isFlushing = true;
		queueMicrotask(flushJobs);
	}
}

/**
 * Flushes all queued jobs.
 *
 * Handles jobs added during execution by processing them in
 * subsequent iterations of the same microtask flush.
 *
 * Uses a reusable buffer to avoid repeated allocation.
 * Each job is individually wrapped in try/catch for isolation.
 */
function flushJobs() {
	try {
		while (jobQueue.size > 0) {
			// Snapshot jobs into the reusable buffer.
			let n = 0;

			for (const job of jobQueue) {
				jobBuffer[n++] = job;
			}

			jobQueue.clear();

			// Execute jobs with isolated error handling.
			for (let i = 0; i < n; i++) {
				const job = jobBuffer[i];

				// Clear the slot immediately so the buffer does not
				// retain job closures after execution.
				jobBuffer[i] = null;

				try {
					job();
				} catch (error) {
					console.error(error);
				}
			}
		}
		
	} finally {
		// Unlock only after all cascading jobs have finished.
		isFlushing = false;
	}
}

/**
 * Stack of currently executing effects.
 *
 * Nested effects are supported by restoring the
 * previous effect when an inner effect finishes.
 *
 * @type {Function[]}
 */
const effectStack = [];

/**
 * Currently active effect.
 *
 * @type {Function|null}
 */
let currentEffect = null;

/**
 * Creates a reactive signal - a primitive reactive value with getter, setter,
 * and manual trigger support.
 *
 * Signals are the foundation of the reactivity system. They track dependencies
 * when read (inside effects or computed) and notify dependents when updated.
 *
 * The returned `trigger` function allows dependents to be notified without
 * changing the stored value. This is useful for shallow reactive systems where
 * nested objects may be mutated in place.
 *
 * @param {any} initialValue - The initial value of the signal.
 * @returns {[
 *   get: () => any,
 *   set: (newValue: any) => void,
 *   trigger: () => void
 * ]}
 * A tuple containing:
 * - `get`: Reads the current value and tracks reactive dependencies.
 * - `set`: Updates the value and notifies dependents if the value changed.
 * - `trigger`: Notifies dependents without modifying the current value.
 *
 * @example
 * const [count, setCount] = createSignal(0);
 *
 * effect(() => {
 *   console.log("Count is:", count());
 * });
 *
 * setCount(5); // Triggers the effect
 *
 * @example
 * const [user, , triggerUser] = createSignal({
 *   name: "John"
 * });
 *
 * user().name = "Jane";
 * triggerUser(); // Notify dependents after an in-place mutation
 */
export function createSignal(initialValue) {
	let value = initialValue;
	const subscribers = new Set();

	const get = () => {
		if (currentEffect) {
			subscribers.add(currentEffect);
			currentEffect.deps.add(subscribers);
		}

		return value;
	};

	const trigger = () => {
		if (subscribers.size === 0) {
			return;
		}

		for (const effect of subscribers) {
			schedule(effect);
		}
	};

	const set = (nextValue) => {
		if (Object.is(value, nextValue)) {
			return;
		}

		value = nextValue;
		trigger();
	};

	return [get, set, trigger];
}

/**
 * Creates and runs a reactive effect.
 *
 * Any signals accessed during execution are tracked
 * automatically and will re-run the effect when changed.
 *
 * @param {Function} fn
 * @param {{ effects: Function[] }=} scope
 * @returns {Function} Cleanup function.
 */
export function effect(fn, scope) {
	const deps = new Set();

	const effectFn = () => {
		for (const dep of deps) {
			dep.delete(effectFn);
		}

		deps.clear();

		effectStack.push(effectFn);
		currentEffect = effectFn;

		try {
			fn();
		} finally {
			effectStack.pop();
			currentEffect = effectStack[effectStack.length - 1] || null;
		}
	};

	effectFn.deps = deps;

	if (scope) {
		scope.effects.push(() => cleanup(effectFn));
	}

	effectFn();

	return () => cleanup(effectFn);
}

/**
 * Cleans up an effect by removing it from all its dependency sets.
 *
 * This prevents memory leaks and stops the effect from being
 * triggered after disposal.
 *
 * @param {Function} effectFn - The effect function to clean up.
 */
function cleanup(effectFn) {
	const deps = effectFn.deps;

	if (!deps) return;

	for (const dep of deps) {
		dep.delete(effectFn);
	}

	deps.clear();
}

/**
 * Creates a lazily-initialized computed reactive value.
 *
 * The computation automatically tracks any reactive dependencies
 * accessed during execution and recomputes whenever one of those
 * dependencies change.
 *
 * Computed values are evaluated only when first accessed.
 *
 * The returned getter can be consumed inside effects, templates,
 * event handlers, methods, and other computed values.
 *
 * @param {Function} fn - Computation function that returns the derived value.
 * @param {{ effects: Function[] }=} [scope] - Optional reactive scope used
 *   to automatically dispose the computed when the scope is cleaned up.
 *
 * @returns {() => any} Reactive getter returning the latest computed value.
 *
 * @example
 * const fullName = computed(() => {
 *   return `${state.firstName} ${state.lastName}`;
 * });
 *
 * effect(() => {
 *   console.log(fullName());
 * });
 *
 * @example
 * const scope = {
 *   effects: []
 * };
 *
 * const total = computed(() => {
 *   return state.price * state.quantity;
 * }, scope);
 */
export function computed(fn, scope) {
	let cachedValue;
	let initialized = false;
	let dispose = null;
	let version = 0;

	// Internal signal used to track consumers of this computed.
	const [track, setVersion] = createSignal(0);

	const recompute = () => {
		const nextValue = fn();

		// Initial evaluation.
		if (!initialized) {
			cachedValue = nextValue;
			initialized = true;
			return;
		}

		// Nothing changed.
		if (Object.is(cachedValue, nextValue)) {
			return;
		}

		// Update first so dependents always see the latest value.
		cachedValue = nextValue;

		// Notify consumers of this computed.
		setVersion(++version);
	};

	const cleanupComputed = () => {
		if (!dispose) {
			return;
		}

		dispose();
		dispose = null;
		initialized = false;
		cachedValue = undefined;
	};

	if (scope) {
		scope.effects.push(cleanupComputed);
	}

	return function computedGetter() {
		if (!dispose) {
			// Lazily create the internal effect.
			dispose = effect(recompute);
		}

		// Track whoever is consuming this computed.
		track();

		return cachedValue;
	};
}

import {
	reactiveArray,
	reactiveMap,
	reactiveSet,
} from "./collections.js";

/**
 * Wraps supported collections with reactive wrappers.
 *
 * Collections remain independently proxied because their
 * mutation APIs require structural interception.
 *
 * @param {*} value
 * @param {Object} owner
 * @param {PropertyKey} key
 * @returns {*}
 */
function wrapCollection(value, owner, key) {
	if (
		value == null ||
		typeof value !== "object" ||
		value.__udodi_reactive__ === true
	) {
		return value;
	}

	if (Array.isArray(value)) {
		return reactiveArray(value, owner, key);
	}

	if (value instanceof Map) {
		return reactiveMap(value, owner, key);
	}

	if (value instanceof Set) {
		return reactiveSet(value, owner, key);
	}

	return value;
}

// Tuple indexes for readability + minification friendliness.
const SIGNAL_GET = 0;
const SIGNAL_SET = 1;
const SIGNAL_TRIGGER = 2;

/**
 * Applies an interceptor and commits the resulting value
 * to a reactive signal.
 *
 * Returning `undefined` from an interceptor cancels the update.
 *
 * @param {PropertyKey} prop
 * @param {*} value
 * @param {[Function, Function, Function]} signal
 * @param {Object|null} interceptors
 * @returns {boolean} True when the value was committed, false when cancelled.
 */
function commit(prop, value, signal, interceptors) {
	let nextValue = value;

	if (interceptors !== null) {
		const interceptor = interceptors[prop];

		if (typeof interceptor === "function") {
			const intercepted = interceptor(value);

			// Returning undefined cancels the update.
			if (intercepted === undefined) {
				return false;
			}

			nextValue = intercepted;
		}
	}

	// createSignal performs Object.is equality checking.
	signal[SIGNAL_SET](nextValue);

	return true;
}

/**
 * Reactive trigger functions indexed by reactive object or
 * registered touch alias.
 *
 * @type {WeakMap<Object, Function>}
 */
const reactiveTriggers = new WeakMap();

/**
 * Creates a shallow reactive object backed by per-property signals.
 *
 * Reactive properties are installed as `Object.defineProperty`
 * accessors. Reading a property tracks the currently active effect,
 * while writing a property updates its signal and notifies subscribers.
 *
 * Nested objects are not made reactive automatically.
 *
 * Properties present during construction are reactive. Properties
 * added later through normal assignment remain non-reactive.
 *
 * When no interceptors are supplied the write path is specialized
 * to avoid interceptor lookup overhead on every assignment.
 *
 * @param {Object} [initialState={}] Initial reactive state.
 * @param {Object} [options={}]
 * @param {Object<string, Function>} [options.interceptors]
 * Optional property interceptors. An interceptor receives the
 * incoming value and may:
 * - Return a transformed value.
 * - Return `undefined` to cancel the update.
 *
 * @returns {Object} Reactive object.
 *
 * @example
 * const state = reactive({
 *   count: 0,
 *   name: "John"
 * });
 *
 * effect(() => {
 *   console.log(state.count);
 * });
 *
 * state.count++;
 *
 * @example
 * const state = reactive(
 *   { age: 18 },
 *   {
 *     interceptors: {
 *       age(value) {
 *         return Math.max(0, value);
 *       }
 *     }
 *   }
 * );
 */
export function reactive(initialState = {}, options = {}) {
	const interceptors = options.interceptors || null;
	const obj = {};
	const signals = Object.create(null);

	const trigger = (key) => {
		const signal = signals[key];

		if (signal !== undefined) {
			signal[SIGNAL_TRIGGER]();
		}
	};

	const keys = Object.keys(initialState);
	const descriptors = {};

	for (let i = 0, length = keys.length; i < length; i++) {
		const key = keys[i];
		const signal = createSignal(
			wrapCollection(initialState[key], obj, key)
		);

		signals[key] = signal;

		if (interceptors === null) {
			// Hot path: no interceptor overhead on every write.
			descriptors[key] = {
				enumerable: true,
				configurable: true,

				get() {
					return signal[SIGNAL_GET]();
				},

				set(nextValue) {
					signal[SIGNAL_SET](wrapCollection(nextValue, obj, key));
				},
			};

		} else {
			descriptors[key] = {
				enumerable: true,
				configurable: true,

				get() {
					return signal[SIGNAL_GET]();
				},

				set(nextValue) {
					nextValue = wrapCollection(nextValue, obj, key);
					commit(key, nextValue, signal, interceptors);
				},
			};
		}
	}

	Object.defineProperties(obj, descriptors);
	reactiveTriggers.set(obj, trigger);

	return obj;
}

/**
 * Registers an alias target so that touch(alias, key) notifies
 * the same triggers as the reactive proxy/object.
 *
 * Useful when multiple objects (for example, `ctx` and a state
 * store) need to share the same reactive signal infrastructure.
 *
 * @param {Object} alias - The object to register as a touch target.
 * @param {Object} reactiveProxy - The reactive object returned by reactive().
 * @returns {boolean} True if successfully registered, false if
 *   the reactive object has no registered triggers.
 *
 * @example
 * const state = reactive({ count: 0 });
 * const ctx = {};
 *
 * registerTouchTarget(ctx, state);
 *
 * // Both targets now notify the same reactive property:
 * touch(ctx, "count");
 * touch(state, "count");
 */
export function registerTouchTarget(alias, reactiveProxy) {
	if (alias == null || reactiveProxy == null) {
		return false;
	}

	const trigger = reactiveTriggers.get(reactiveProxy);

	if (!trigger) {
		return false;
	}

	reactiveTriggers.set(alias, trigger);

	return true;
}

/**
 * Unregisters a touch target alias.
 *
 * Use this during component unmount or cleanup to prevent stale
 * references and allow the alias to be garbage collected.
 *
 * @param {Object} alias - The object to unregister.
 * @returns {boolean} True if an entry was deleted, false otherwise.
 *
 * @example
 * unregisterTouchTarget(ctx);
 */
export function unregisterTouchTarget(alias) {
	if (alias == null) {
		return false;
	}

	return reactiveTriggers.delete(alias);
}

/**
 * Notifies subscribers that a shallow reactive property has been
 * mutated in place without replacing its reference.
 *
 * This is primarily used after mutating nested objects in shallow
 * reactive state.
 *
 * @param {Object} proxy - Reactive object or registered touch target.
 * @param {PropertyKey} key - Root reactive property to notify.
 * @returns {boolean} True if notification was sent, false otherwise.
 *
 * @example
 * const state = reactive({
 *   user: {
 *     name: "John"
 *   }
 * });
 *
 * state.user.name = "Jane";
 * touch(state, "user");
 */
export function touch(proxy, key) {
	if (typeof key !== "string" && typeof key !== "symbol") {
		return false;
	}

	const trigger = reactiveTriggers.get(proxy);

	if (!trigger) {
		return false;
	}

	trigger(key);

	return true;
}

const REACTIVE_BINDING = Symbol("REACTIVE_BINDING");

/**
 * Creates a reactive data tunnel for prop passing.
 * Maps a target object property to a lazy evaluation wrapper.
 *
 * @param {Function} getterFn - An arrow function returning the target proxy property.
 * @returns {Object} A marked reactive binding descriptor object.
 *
 * @example
 * // Passing a LIVE, reactive property connection.
 * ${ChildComponent({
 *     count: bindProp(() => ctx.count)
 * })}
 *
 * @example
 * // Passing a STATIC primitive snapshot (By Value).
 * ${ChildComponent({
 *     count: ctx.count
 * })}
 */
export function bindProp(getterFn) {
	return {
		[REACTIVE_BINDING]: true,

		// This getter executes the arrow function later, tunneling
		// directly into the parent's active tracking signal.
		get value() {
			return getterFn();
		},
	};
}

/**
 * Evaluates whether an incoming component prop is a reactive tunnel.
 *
 * @param {any} prop
 * @returns {boolean}
 */
export function isReactiveProp(prop) {
	return (
		prop !== null &&
		typeof prop === "object" &&
		prop[REACTIVE_BINDING] === true
	);
}

/**
 * Safely extracts the active value from a prop gateway.
 * If the prop is static, it passes it through untouched.
 *
 * @param {any} prop
 * @returns {any}
 */
export function unwrapReactiveProp(prop) {
	return isReactiveProp(prop) ? prop.value : prop;
}
