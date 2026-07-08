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
	// during this synchronous execution block
	if (!isFlushing) {
		isFlushing = true;
		queueMicrotask(flushJobs);
	}
}

/**
 * Flushes all queued jobs.
 *
 * Handles jobs added during execution by scheduling
 * another microtask flush when necessary.
 */
function flushJobs() {
	try {
		while (jobQueue.size > 0) {
			const jobs = Array.from(jobQueue);
			jobQueue.clear();

			for (let i = 0; i < jobs.length; i++) {
				jobs[i]();
			}
		}
	} finally {
		// Unlock it only after ALL cascading jobs have finished running
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

	const [track, trigger] = createSignal(0);

	const recompute = () => {
		const nextValue = fn();

		// Initial evaluation
		if (!initialized) {
			cachedValue = nextValue;
			initialized = true;
			return;
		}

		// Notify dependents only when the value changes
		if (!Object.is(cachedValue, nextValue)) {
			cachedValue = nextValue;
			trigger(++version);
		}
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
			// No scope forwarding here.
			// We manage cleanup ourselves so the computed can be recreated.
			dispose = effect(recompute);
		}

		// Track consumers of this computed.
		track();

		return cachedValue;
	};
}

// Tuple indexes for readability + minification friendliness
const SIGNAL_GET = 0;
const SIGNAL_SET = 1;
const SIGNAL_TRIGGER = 2;

/**
 * Applies an interceptor (if any) and commits the value.
 *
 * @param {PropertyKey} prop
 * @param {*} value
 * @param {[Function, Function]} signal
 * @param {Object} target
 * @param {Object|null} interceptors
 * @returns {boolean}
 */
function commit(prop, value, signal, target, interceptors) {
	let nextValue = value;

	if (interceptors !== null) {
		const interceptor = interceptors[prop];

		if (typeof interceptor === "function") {
			const intercepted = interceptor(value);

			// Returning undefined cancels the update.
			if (intercepted === undefined) {
				return true;
			}

			nextValue = intercepted;
		}
	}

	// Update the reactive signal.
	signal[SIGNAL_SET](nextValue);

	// Keep the backing object synchronized.
	target[prop] = nextValue;

	return true;
}

const reactiveTriggers = new WeakMap();

/**
 * Creates a shallow reactive object backed by per-property signals.
 *
 * Reading a property tracks the currently active effect.
 * Writing a property updates its signal and notifies subscribers.
 *
 * Nested objects are not made reactive automatically.
 *
 * @param {Object} [initialState={}] Initial reactive state.
 * @param {Object} [options={}]
 * @param {Object<string, Function>} [options.interceptors={}]
 * Optional property interceptors. An interceptor receives the
 * incoming value and may:
 * - Return a transformed value.
 * - Return `undefined` to cancel the update.
 *
 * @returns {Object} Reactive proxy.
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

	/**
	 * Property signal registry.
	 *
	 * @type {Map<PropertyKey, { getter: Function, setter: Function }>}
	 */
	const signals = new Map();

	/**
	 * Underlying target object used by the Proxy.
	 *
	 * Non-reactive properties are stored directly here.
	 *
	 * @type {Object}
	 */
	const target = {};

	// Initialize signals.
	const keys = Object.keys(initialState);

	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		const value = initialState[key];

		signals.set(key, createSignal(value));
		target[key] = value;
	}

	const trigger = (key) => {
        const signal = signals.get(key);

        if (signal !== undefined) {
            signal[SIGNAL_TRIGGER]();
        }
    };

	const proxy = new Proxy(target, {
		get(target, prop) {
			const signal = signals.get(prop);

			return signal !== undefined
				? signal[SIGNAL_GET]()
				: target[prop];
		},

		set(target, prop, value) {
			const signal = signals.get(prop);

			if (signal !== undefined) {
				return commit(
					prop,
					value,
					signal,
					target,
					interceptors
				);
			}

			// Non-reactive property.
			target[prop] = value;
			return true;
		},

		has(target, prop) {
			return prop in target || signals.has(prop);
		},

		ownKeys(target) {
			const keys = new Set(Reflect.ownKeys(target));

			for (const key of signals.keys()) {
				keys.add(key);
			}

			return Array.from(keys);
		},

		getOwnPropertyDescriptor(target, prop) {
			if (signals.has(prop)) {
				return {
					enumerable: true,
					configurable: true,
					writable: true,
				};
			}

			return Reflect.getOwnPropertyDescriptor(target, prop);
		},
	});

	reactiveTriggers.set(proxy, trigger);

    return proxy;
}

/**
 * Notifies subscribers that a shallow reactive property has been
 * mutated in place without replacing its reference.
 *
 * This is primarily used after mutating nested objects in a shallow
 * reactive state.
 *
 * @param {Object} proxy - Reactive object returned by `reactive()`.
 * @param {PropertyKey} key - Root reactive property to notify.
 * @returns {boolean}
 */
export function touch(proxy, key) {
	if (typeof key !== "string" && typeof key !== "symbol") {
        return false;
    }

    const state = proxy._state || proxy;
	const trigger = reactiveTriggers.get(state);

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
 * // 1. Passing a LIVE, reactive property connection
 * // Changes in the parent state will automatically reflect inside the child component.
 * ${ChildComponent({
 *     count: bindProp(() => ctx.count)
 * })}
 *
 * @example
 * // 2. Passing a STATIC primitive snapshot (By Value)
 * // The child receives a static snapshot copy locked at whatever value ctx.count was during this render pass.
 * ${ChildComponent({
 *     count: ctx.count
 * })}
 */
export function bindProp(getterFn) {
	return {
		[REACTIVE_BINDING]: true,
		// This getter executes the arrow function later, tunneling directly
		// into the parent proxy's active tracking signal upon access.
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
		prop !== null && typeof prop === "object" && prop[REACTIVE_BINDING] === true
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
