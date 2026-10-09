import {
	computed,
	effect,
	reactive,
	isReactiveProp,
	unwrapReactiveProp,
	registerTouchTarget,
	unregisterTouchTarget,
} from "../reactivity/index.js";

import { createScopeId, registerScope } from "./styleScope.js";
import { readonly } from "./readonly.js";
import { addComponent } from "../runtime/componentRegistry.js";
import { runScopeCleanup } from "../runtime/lifecycle.js";

import { stdlib } from "../stdlib/index.js";

/**
 * Returns true when `key` is a framework-reserved keyword
 * that users must never overwrite.
 *
 * Implemented as a switch over string literals so there is
 * no Set allocation and the check stays branch-predictable.
 *
 * @param {string} key
 * @returns {boolean}
 */
function isReservedKeyword(key) {
	switch (key) {
		case "name":
		case "state":
		case "computed":
		case "interceptors":
		case "methods":
		case "watch":
		case "template":
		case "onMount":
		case "onUnmount":
		case "refs":
		case "style":
		case "ud":
			return true;
		default:
			return false;
	}
}

/**
 * Ensures `state()` returned a plain object suitable for shallow reactivity.
 *
 * @param {*} value - Value returned by the state factory.
 * @param {string} componentName - Component name for error reporting.
 * @returns {Object} The validated state object.
 * @throws {TypeError} If the value is not a non-null, non-array object.
 */
function assertStateObject(value, componentName) {
	if (
		value === null ||
		typeof value !== "object" ||
		Array.isArray(value)
	) {
		throw new TypeError(
			`[createComponent] Invalid state in Component "${componentName}". ` +
			'The "state()" must return an object.',
		);
	}

	return value;
}

/**
 * Validates that a context key does not collide with framework-reserved
 * keywords or keys already present in the given registry.
 *
 * Does not write to the registry.
 *
 * @param {Object<string, string>} registry - Null-prototype string dictionary.
 * @param {string} key - Context property name.
 * @param {string} namespaceName - Source namespace
 *   (e.g. "state", "computed", "methods", "props").
 * @param {string} componentName - Component name for error reporting.
 * @throws {Error} If the key is reserved or already registered.
 */
function verifyKey(registry, key, namespaceName, componentName) {
	if (isReservedKeyword(key)) {
		throw new Error(
			`[createComponent] Collision Error in Component "${componentName}": ` +
			`The key "${key}" inside "${namespaceName}" is a reserved framework keyword and cannot be overridden.`,
		);
	}

	const existingNamespace = registry[key];

	if (existingNamespace !== undefined) {
		throw new Error(
			`[createComponent] Namespace Collision in Component "${componentName}": ` +
			`The key "${key}" declared in "${namespaceName}" conflicts with the existing "${key}" declared in "${existingNamespace}". ` +
			`All root-level state, computed properties, methods, and props must have unique names.`,
		);
	}
}

/**
 * Validates a context key, then records it in the registry.
 *
 * @param {Object<string, string>} registry - Null-prototype string dictionary.
 * @param {string} key - Context property name.
 * @param {string} namespaceName - Source namespace
 *   (e.g. "state", "computed", "methods").
 * @param {string} componentName - Component name for error reporting.
 * @throws {Error} If the key is reserved or already registered.
 */
function registerAndVerifyKey(registry, key, namespaceName, componentName) {
	verifyKey(registry, key, namespaceName, componentName);
	registry[key] = namespaceName;
}

/**
 * createComponent - component factory
 *
 * **Reactivity Model:**
 * - State is reactive at the TOP LEVEL ONLY (shallow reactivity).
 * - Nested objects are NOT auto-proxied. Mutating nested properties won't
 *   trigger updates unless the owning root key is touched.
 * - Watchers only track changes to first-level keys.
 * - To track nested changes, watch the parent key or update it entirely:
 *   `ctx.pricing = {...}`.
 *
 * **Props and Reactivity:**
 * - Regular props are plain value snapshots: `Child({ name: "John" })`.
 * - Reactive props maintain live connections:
 *   `Child({ data: bindProp(() => ctx.data) })`.
 * - Use `bindProp()` to explicitly share reactive state from parent to child.
 * - Without `bindProp()`, changes in parent's state won't update child
 *   (intended behavior).
 *
 * **Context and Reactivity:**
 * - The internal context and public context membrane are registered as
 *   touch targets for the component's reactive state.
 * - This allows `touch(ctx, key)` to notify the same subscribers as
 *   `touch(stateStore, key)` without exposing an internal `_state` property.
 * - The public context membrane remains a Proxy because it is responsible
 *   for enforcing root-context write barriers and reserved-key protection.
 *
 * **Key registry:**
 * - `definedKeys` is a null-prototype string dictionary mapping each
 *   component-level key to its namespace ("state" | "computed" | "methods").
 * - Per-instance props are validated with `verifyKey(definedKeys, …)`
 *   and tracked via a null-prototype membership table (`propKeySet`).
 *
 * **Allocation notes:**
 * - `computedScope` / `watcherScope` are allocated only when needed.
 * - Watcher config is parsed once at definition time.
 * - State-reuse diagnostics use a WeakSet so the component factory does
 *   not strongly retain previous state instances.
 */
export function createComponent({
	name = "",
	state = () => ({}),           // for reactive state (auto-tracked by framework)
	computed: computedProps = {}, // for computed properties
	interceptors = null,          // for data transformations before state updates
	methods = {},                 // for event handlers and normal functions
	watch = {},                   // for watching reactive state changes
	style = "",                   // for CSS styles
	template = "",
	onMount = null,
	onUnmount = null,
}) {
	const compName = name || "Unknown";

	if (typeof state !== "function") {
		throw new TypeError(
			`[createComponent] Invalid state in Component "${compName}". ` +
			'The "state" must be a function that returns an object.',
		);
	}

	// Definition-time call: validate shape and discover fixed state keys.
	const initialState = assertStateObject(state(), compName);

	/**
	 * Registry of all root-level names exposed on the component context.
	 *
	 * Null-prototype string dictionary:
	 *   `key → "state" | "computed" | "methods"`
	 *
	 * Used for collision detection and for routing inside the public membrane.
	 *
	 * @type {Object<string, string>}
	 */
	const definedKeys = Object.create(null);

	/**
	 * Precomputed key collections and watcher descriptors reused by
	 * every component instance.
	 */
	const stateKeys = Object.keys(initialState);
	const computedKeys = Object.keys(computedProps);
	const methodKeys = Object.keys(methods);
	const watchKeys = Object.keys(watch);

	/**
	 * Watcher definitions normalized once at component-definition time.
     * Each entry is `{ deps, handler }`.
	 *
	 * @type {Array<{ deps: string[], handler: Function }>}
	 */
	const watchEntries = [];

	for (let i = 0, len = watchKeys.length; i < len; i++) {
		const definition = watch[watchKeys[i]];
		watchEntries.push({
			deps: definition.deps || [],
			handler: definition.handler,
		});
	}

	// Single pass over the component-level namespaces using the
	// already-computed key arrays (no second Object.keys()).
	for (let i = 0, len = stateKeys.length; i < len; i++) {
		registerAndVerifyKey(definedKeys, stateKeys[i], "state", compName);
	}
	for (let i = 0, len = computedKeys.length; i < len; i++) {
		registerAndVerifyKey(definedKeys, computedKeys[i], "computed", compName);
	}
	for (let i = 0, len = methodKeys.length; i < len; i++) {
		registerAndVerifyKey(definedKeys, methodKeys[i], "methods", compName);
	}

	/**
	 * Tracks state objects returned by `state()` so reused references
	 * can be detected. Entries are held weakly, so the component factory
	 * does not strongly retain previous state instances.
	 *
	 * @type {WeakSet<object>}
	 */
	const seenStateInstances = new WeakSet();
	seenStateInstances.add(initialState);

	// Generate one unique scope identifier for this component definition.
	// All instances reuse the same scope identifier.
	const scopeId = style !== "" ? createScopeId() : null;
	let styleMounted = false;

	/**
	 * Creates a component instance.
	 *
	 * @param {Object<string, any>} [props={}] Component props.
	 * @returns {import("../types/context.d.js").ComponentInstance}
	 */
	function Component(props = {}) {
		/**
		 * Per-instance prop membership table (null-prototype).
		 * Props are not part of the shared `definedKeys` dictionary.
		 *
		 * @type {Object<string, true>}
		 */
		const propKeySet = Object.create(null);
		const internalState = assertStateObject(state(), compName);

		// Detect a state factory that reuses the same object reference.
		if (seenStateInstances.has(internalState)) {
			console.warn(
				`[createComponent] state() in Component "${compName}" returned the ` +
				`same object for multiple instances. The "state()" should return a fresh object.`,
			);
		}

		seenStateInstances.add(internalState);

		// Initialize the framework namespace (ud).
		internalState.ud = {
			forms: Object.create(null), // For @form and @submit directives.
		};

		// Initialize the reactive state engine.
		//
		// reactive() is shallow: only the state properties present when the
		// state object is created receive reactive accessors.
		// interceptors is null when empty so reactive() uses the
		// specialized no-interceptor write path.
		const stateStore = reactive(internalState, { interceptors });

		// Build the flat, highly accessible VM context.
		const internalContext = {
			name: compName,

			// Load framework defaults.
			// Note that the user should override the functions.
			...stdlib,

			refs: Object.create(null), // Reference for HTML elements.
		};

		/**
		 * Framework namespace bridge.
		 *
		 * `ud` is backed by stateStore so it remains part of the component's
		 * reactive state while the public membrane can expose it read-only.
		 */
		Object.defineProperty(internalContext, "ud", {
			get: () => stateStore.ud,
			set: (value) => {
				stateStore.ud = value;
			},
			enumerable: true,
			configurable: true,
		});

		// Target container for the mount-injected cleanup hook.
		let injectedCleanupFn = null;

		/**
		 * Secure callback membrane.
		 *
		 * The membrane intentionally remains a Proxy. It provides the public
		 * context write barriers and prevents users from adding or replacing
		 * arbitrary root-level context properties.
		 *
		 * Reactive state reads and writes are routed directly to stateStore.
		 * Component-level key kinds are resolved via `definedKeys`.
		 * Per-instance props are resolved via `propKeySet`.
		 */
		const publicContextMembrane = new Proxy(internalContext, {
			get(target, prop) {
				if (prop === "refs") return target.refs;
				if (prop === "ud") return readonly(target.ud);
				if (prop === "name") return compName;
				if (prop === "cleanup") return injectedCleanupFn;

				const kind = definedKeys[prop];

				if (kind === "state") return stateStore[prop];
				if (kind === "computed") return internalContext[prop]();
				if (kind === "methods") return internalContext[prop];
				if (propKeySet[prop] !== undefined) return internalContext[prop];

				return undefined;
			},

			set(target, prop, value) {
				if (prop === "_injectCleanupHook") {
					injectedCleanupFn = value;
					return true;
				}

				if (definedKeys[prop] === "state") {
					stateStore[prop] = value;
					return true;
				}

				const errorMessage = isReservedKeyword(prop)
					? `You can not update or override the "${prop}" reserved keyword.`
					: `You cannot append "${prop}" to the root context.`;

				throw new Error(
					`[context] Mutation Error in Component "${compName}": ${errorMessage}`,
				);
			},
		});

		/**
		 * Register both context surfaces as aliases of the component's
		 * reactive state trigger registry.
		 *
		 * `internalContext` is used by the VM while
		 * `publicContextMembrane` is exposed to user callbacks.
		 */
		registerTouchTarget(internalContext, stateStore);
		registerTouchTarget(publicContextMembrane, stateStore);

		// Allocate computed scope only when the component defines computeds.
		const computedScope = computedKeys.length 
			? { effects: [], cleanups: [] } 
			: null;

		if (computedScope) {
			for (let i = 0, len = computedKeys.length; i < len; i++) {
				const computedName = computedKeys[i];
				const computeFn = computedProps[computedName];

				internalContext[computedName] = computed(
					() => computeFn(publicContextMembrane),
					computedScope,
				);
			}
		}

		const propKeys = Object.keys(props);

		// Dynamic live prop binding gateway.
		// Validated with verifyKey (no write to definedKeys).
		for (let i = 0, len = propKeys.length; i < len; i++) {
			const key = propKeys[i];
			const prop = props[key];

			verifyKey(definedKeys, key, "props", compName);

			if (isReactiveProp(prop)) {
				Object.defineProperty(internalContext, key, {
					get: () => unwrapReactiveProp(prop),
					enumerable: true,
					configurable: true,
				});
			} else {
				// Static prop snapshot used by bindDOM / VM access.
				internalContext[key] = prop;
			}

			propKeySet[key] = true;
		}

		// Methods (utility / handler / helper functions).
		// Bind methods once so each instance reuses the bound function.
		for (let i = 0, len = methodKeys.length; i < len; i++) {
			const methodName = methodKeys[i];
			internalContext[methodName] = methods[methodName].bind(publicContextMembrane);
		}

		// Map state keys directly onto the base context for VM interpreter access.
		for (let i = 0, len = stateKeys.length; i < len; i++) {
			const key = stateKeys[i];

			Object.defineProperty(internalContext, key, {
				get: () => stateStore[key],
				set: (value) => {
					stateStore[key] = value;
				},
				enumerable: true,
				configurable: true,
			});
		}

		// Allocate watcher scope only when the component defines watchers.
		const watcherScope = watchEntries.length 
			? { effects: [], cleanups: [] } 
			: null;

		if (watcherScope) {
			// Watchers only track top-level reactive state changes.
			// Value bags are reused across runs to reduce GC pressure.
			for (let i = 0, len = watchEntries.length; i < len; i++) {
				const { deps, handler } = watchEntries[i];

				const prevValues = Object.create(null);
				const newValues = Object.create(null);
				const oldValues = Object.create(null);
				let initialized = false;

				effect(() => {
					let hasChanged = false;

					for (let j = 0, depLen = deps.length; j < depLen; j++) {
						const dep = deps[j];
						const previous = prevValues[dep];
						const current = stateStore[dep];

						oldValues[dep] = previous;
						newValues[dep] = current;

						if (!Object.is(previous, current)) {
							hasChanged = true;
						}

						prevValues[dep] = current;
					}

					if (initialized && hasChanged) {
						handler.call(publicContextMembrane, newValues, oldValues);
					}

					initialized = true;
				}, watcherScope);
			}
		}

		// Register new style for CSS scoping.
		if (!styleMounted && scopeId !== null) {
			registerScope(scopeId, style);
			styleMounted = true;
		}

		const html = typeof template === "function" 
			? template(publicContextMembrane) 
			: template;

		return {
			name: compName,
			template: html,
			scopeId,

			// Handed over with open VM access.
			context: internalContext,

			// Restricted context exposed to user functions.
			publicContext: publicContextMembrane,

			onMount(root) {
				onMount?.(root, publicContextMembrane);
			},

			onUnmount(root) {
				try {
					if (watcherScope) {
						runScopeCleanup(watcherScope, "[component watcher]");
					}

					if (computedScope) {
						runScopeCleanup(computedScope, "[component computed]");
					}

					// Remove both aliases so no stale context references
					// remain in the touch registry after component teardown.
					unregisterTouchTarget(internalContext);
					unregisterTouchTarget(publicContextMembrane);

					onUnmount?.(root, publicContextMembrane);

				} catch (err) {
					console.warn(
						`[createComponent] onUnmount error in Component "${compName}":`,
						err,
					);
				}
			},
		};
	}

	return (props = {}) => {
		// Register this component.
		const placeholder = addComponent(Component, props);

		// Return the component insertion placeholder.
		return placeholder;
	};
}
