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

// Immutable blacklist of framework keywords that users can NEVER overwrite.
const RESERVED_KEYWORDS = new Set([
	"name",
	"state",
	"computed",
	"interceptors",
	"methods",
	"watch",
	"template",
	"onMount",
	"onUnmount",
	"refs",
	"style",
	"ud",
]);

/**
 * Registers a context key and validates that it does not collide
 * with framework-reserved keywords or previously registered keys.
 *
 * @param {Map<string, string>} registry - Key registry.
 * @param {string} key - Context property name.
 * @param {string} namespaceName - Source namespace
 *   (e.g. "state", "computed", "methods", "props").
 * @param {string} componentName - Component name for error reporting.
 * @throws {Error} If the key is reserved or already registered.
 */
function registerAndVerifyKey(
	registry,
	key,
	namespaceName,
	componentName,
) {
	if (RESERVED_KEYWORDS.has(key)) {
		throw new Error(
			`[createComponent] Collision Error in Component "${componentName}": ` +
			`The key "${key}" inside "${namespaceName}" is a reserved framework keyword and cannot be overridden.`,
		);
	}

	const existingNamespace = registry.get(key);

	if (existingNamespace !== undefined) {
		throw new Error(
			`[createComponent] Namespace Collision in Component "${componentName}": ` +
			`The key "${key}" declared in "${namespaceName}" conflicts with the existing "${key}" declared in "${existingNamespace}". ` +
			`All root-level state, computed properties, methods, and props must have unique names.`,
		);
	}

	registry.set(key, namespaceName);
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

	let lastStateInstance = state();

	if (
		lastStateInstance === null ||
		typeof lastStateInstance !== "object" ||
		Array.isArray(lastStateInstance)
	) {
		throw new TypeError(
			`[createComponent] Invalid state in Component "${compName}". ` +
			'The "state()" must return an object.',
		);
	}

	/**
	 * Registry of all root-level names exposed on the component context.
	 *
	 * Used to prevent collisions between:
	 * - state
	 * - computed
	 * - methods
	 * - props
	 */
	const definedKeys = new Map();

	/**
	 * Precomputed key collections reused by every component instance.
	 *
	 * This avoids repeatedly allocating arrays and performing prototype
	 * chain lookups inside hot paths such as the context membrane.
	 */
	const stateKeys = Object.keys(lastStateInstance);
	const computedKeys = Object.keys(computedProps);
	const methodKeys = Object.keys(methods);

	const stateKeySet = new Set(stateKeys);
	const computedKeySet = new Set(computedKeys);
	const methodKeySet = new Set(methodKeys);

	const configurationGroups = [
		[lastStateInstance, "state"],
		[computedProps, "computed"],
		[methods, "methods"],
	];

	// Single iteration pass over the component-level namespaces.
	for (let i = 0; i < configurationGroups.length; i++) {
		const [groupObject, groupName] = configurationGroups[i];
		const keys = Object.keys(groupObject);

		for (let j = 0; j < keys.length; j++) {
			registerAndVerifyKey(
				definedKeys,
				keys[j],
				groupName,
				compName,
			);
		}
	}

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
		const propKeySet = new Set();
		const internalState = state();

		// Check if a reference to the state object is being reused.
		if (internalState === lastStateInstance) {
			console.warn(
				`[createComponent] state() in Component "${compName}" returned the ` +
				`same object for multiple instances. The "state()" should return a fresh object.`,
			);
		}

		lastStateInstance = internalState;

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
		 */
		const publicContextMembrane = new Proxy(internalContext, {
			get(target, prop) {
				if (prop === "refs") {
					return target.refs;
				}

				// Readonly membrane for the user-defined namespace (ud).
				if (prop === "ud") {
					return readonly(target.ud);
				}

				if (prop === "name") {
					return compName;
				}

				if (prop === "cleanup") {
					return injectedCleanupFn;
				}

				if (stateKeySet.has(prop)) {
					return stateStore[prop];
				}

				if (computedKeySet.has(prop)) {
					return internalContext[prop]();
				}

				if (methodKeySet.has(prop)) {
					return internalContext[prop];
				}

				if (propKeySet.has(prop)) {
					return internalContext[prop];
				}

				return undefined;
			},

			set(target, prop, value) {
				if (prop === "_injectCleanupHook") {
					injectedCleanupFn = value;
					return true;
				}

				if (stateKeySet.has(prop)) {
					stateStore[prop] = value;
					return true;
				}

				const errorMessage = RESERVED_KEYWORDS.has(prop)
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

		const computedScope = {
			effects: [],
			cleanups: [],
		};

		// Computed bindings.
		for (let i = 0; i < computedKeys.length; i++) {
			const computedName = computedKeys[i];
			const computeFn = computedProps[computedName];

			internalContext[computedName] = computed(
				() => computeFn(publicContextMembrane),
				computedScope,
			);
		}

		/**
		 * Instance-specific registry.
		 *
		 * Component-level definitions are already registered in
		 * `definedKeys`. Props are validated against a cloned registry
		 * so every component instance can safely receive different props.
		 */
		const instanceKeys = new Map(definedKeys);
		const propKeys = Object.keys(props);

		// Dynamic live prop binding gateway.
		for (let i = 0; i < propKeys.length; i++) {
			const key = propKeys[i];
			const prop = props[key];

			registerAndVerifyKey(
				instanceKeys,
				key,
				"props",
				compName,
			);

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

			propKeySet.add(key);
		}

		// Methods (utility / handler / helper functions).
		// Bound once so invocation does not allocate a rest array.
		for (let i = 0; i < methodKeys.length; i++) {
			const methodName = methodKeys[i];
			const methodFn = methods[methodName];

			if (typeof methodFn !== "function") {
				continue;
			}

			internalContext[methodName] = methodFn.bind(publicContextMembrane);
		}

		// Map state keys directly onto the base context for VM interpreter access.
		for (let i = 0; i < stateKeys.length; i++) {
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

		const watcherScope = {
			effects: [],
			cleanups: [],
		};

		const watchKeys = Object.keys(watch);

		// Setup watchers.
		//
		// Watchers only track top-level reactive state changes.
		// Value bags are reused across runs to reduce GC pressure.
		for (let i = 0; i < watchKeys.length; i++) {
			const watchConfig = watch[watchKeys[i]];
			const { deps = [], handler } = watchConfig;

			const prevValues = Object.create(null);
			const newValues = Object.create(null);
			const oldValues = Object.create(null);
			let initialized = false;

			effect(() => {
				let hasChanged = false;

				for (let j = 0; j < deps.length; j++) {
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
					handler.call(
						publicContextMembrane,
						newValues,
						oldValues,
					);
				}

				initialized = true;
			}, watcherScope);
		}

		// Register new style for CSS scoping.
		if (!styleMounted && scopeId !== null) {
			registerScope(scopeId, style);
			styleMounted = true;
		}

		const html =
			typeof template === "function"
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
					runScopeCleanup(
						watcherScope,
						"[component watcher]",
					);

					runScopeCleanup(
						computedScope,
						"[component computed]",
					);

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
