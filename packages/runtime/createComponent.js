import {
	computed,
	effect,
	reactive,
	isReactiveProp,
	unwrapReactiveProp,
} from "../reactivity/index.js";

import { createScopeId, registerScope } from "./styleScope.js";
import { readonly } from "./readonly.js";
import { addComponent } from "../runtime/componentRegistry.js";
import { runScopeCleanup } from "../runtime/lifecycle.js";

// Immutable blacklist of framework keywords that users can NEVER overwrite
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
	componentName
) {
	if (RESERVED_KEYWORDS.has(key)) {
		throw new Error(
			`[createComponent] Collision Error in Component "${componentName}": ` +
			`The key "${key}" inside "${namespaceName}" is a reserved framework keyword and cannot be overridden.`
		);
	}

	const existingNamespace = registry.get(key);

	if (existingNamespace !== undefined) {
		throw new Error(
			`[createComponent] Namespace Collision in Component "${componentName}": ` +
			`The key "${key}" declared in "${namespaceName}" conflicts with the existing "${key}" declared in "${existingNamespace}". ` +
			`All root-level state, computed properties, methods, and props must have unique names.`
		);
	}

	registry.set(key, namespaceName);
}

/**
 * createComponent - component factory
 *
 * **Reactivity Model:**
 * - State is reactive at the TOP LEVEL ONLY (shallow reactivity)
 * - Nested objects are NOT auto-proxied. Mutating nested properties won't trigger updates
 * - Watchers only track changes to first-level keys
 * - To track nested changes, watch the parent key or update it entirely: ctx.pricing = {...}
 *
 * **Props and Reactivity:**
 * - Regular props are plain value snapshots: Child({ name: "John" })
 * - Reactive props maintain live connections: Child({ data: bindProp(() => ctx.data) })
 * - Use bindProp() to explicitly share reactive state from parent to child
 * - Without bindProp(), changes in parent's state won't update child (intended behavior)
 */
export function createComponent({
	name = "",
	state = () => ({}),           // for reactive state (auto-tracked by framework)
	computed: computedProps = {}, // for computed properties
	interceptors = {},            // for data transformations before state updates
	methods = {},                 // for event handlers and normal functions (formatters, helpers, etc.)
	watch = {},                   // for watching reactive state changes
	style = "",                   // for CSS styles
	template = "",
	onMount = null,
	onUnmount = null,
}) {
	const compName = name || "unknown";

	if (typeof state !== "function") {
		throw new TypeError(
			`[createComponent] Invalid state in Component "${compName}". ` +
			'The "state" must be a function that returns an object.'
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
			'The "state()" must return an object.'
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
		[methods, "methods"]
	];

	// Single iteration pass over the groupings
	for (let i = 0; i < configurationGroups.length; i++) {
		const [groupObject, groupName] = configurationGroups[i];
		const keys = Object.keys(groupObject);

		for (let j = 0; j < keys.length; j++) {
			registerAndVerifyKey(
				definedKeys,
				keys[j],
				groupName,
				compName
			);
		}
	}

	// Generate a unique scope identifier for the component so that each 
	// instance will re-use the scope identifier.
	const scopeId = style !== "" ? createScopeId() : null;
	let styleMounted = false;
	
	/**
	 * Creates a component instance.
	 *
	 * @param {Object<string, any>} [props={}] Component props.
	 * @returns {{
	 *   name: string,
	 *   template: string,
	 *   context: Object,
	 *   watcherScope: { effects: Function[], cleanups: Function[] },
	 *   _membrane: Object,
	 *   onMount(root: HTMLElement): void,
	 *   onUnmount(root: HTMLElement): void
	 * }}
	 */
	function Component(props = {}) {
		const propKeySet = new Set();
		const internalState = state();

		// Check if a reference to state object is being re-used
		if (internalState === lastStateInstance) {
			console.warn(
				`[createComponent] state() in Component "${compName}" returned the ` + 
				`same object for multiple instances. The "state()" should return a fresh object.`
			);
		}

		lastStateInstance = internalState;

		// Initialize the framework namespace (ud)
		internalState.ud = {
			forms: Object.create(null),  // For @form and @submit directives
		};

		// Initialize the reactive state engine
		const stateStore = reactive(internalState, { interceptors });

		// Build the flat, highly accessible VM Context
		const internalContext = {
			refs: Object.create(null), // Reference for HTML element
		};

		Object.defineProperty(internalContext, "ud", {
			get: () => stateStore.ud,
			set: (value) => {
				stateStore.ud = value;
			},
			enumerable: true,
			configurable: true,
		});

		// Since the internalContext is not returned by reactive() function, 
		// we need this configuration for touch() function to work.
		Object.defineProperty(internalContext, "_state", {
			value: stateStore,
			enumerable: false,
			configurable: false,
			writable: false,
		});

		// Target container for the mount-injected cleanup hook
		let injectedCleanupFn = null;

		// Secure callback membrane (The filtered 'ctx' passed to user functions)
		const publicContextMembrane = new Proxy(internalContext, {
			get(target, prop) {
				if (prop === "_state") return target._state;
				if (prop === "refs") return target.refs;

				// readonly membrane for the user-defined namespace (ud)
				if (prop === "ud") {
					return readonly(target.ud);
				}

				if (prop === "name") return compName;
				if (prop === "cleanup") return injectedCleanupFn;

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
					: `You cannot append "${prop}" to the root context.`

				throw new Error(
					`[context] Mutation Error in Component "${compName}": ${errorMessage}`
				);
			}
		});

		const computedScope = { effects: [], cleanups: [] };

		// Computed bindings
		for (let i = 0; i < computedKeys.length; i++) {
			const computedName = computedKeys[i];
			const computeFn = computedProps[computedName];

			internalContext[computedName] = computed(
				() => computeFn(publicContextMembrane),
				computedScope
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
		const propEntries = Object.entries(props);

		// Dynamic Live Prop Binding Gateway
		for (let i = 0; i < propEntries.length; i++) {
			const [key, prop] = propEntries[i];
			registerAndVerifyKey(
				instanceKeys,
				key,
				"props",
				compName
			);

			if (isReactiveProp(prop)) {
				Object.defineProperty(internalContext, key, {
					get: () => unwrapReactiveProp(prop),
					enumerable: true,
					configurable: true
				});
			} else {
				internalContext[key] = prop; // bindDOM / VM access
			}

			propKeySet.add(key);
		}

		// Methods (utility/handler/helper functions)
		for (let i = 0; i < methodKeys.length; i++) {
			const methodName = methodKeys[i];
			const methodFn = methods[methodName];

			if (typeof methodFn !== "function") {
				continue;
			}

			internalContext[methodName] = (...args) =>
				methodFn.call(publicContextMembrane, ...args);
		}

		// Map state keys directly onto the base context for VM interpreter
		for (let i = 0; i < stateKeys.length; i++) {
			const key = stateKeys[i];

			Object.defineProperty(internalContext, key, {
				get: () => stateStore[key],
				set: (v) => {
					stateStore[key] = v;
				},
				enumerable: true,
				configurable: true
			});
		}

		const watcherScope = { effects: [], cleanups: [] };
		const watchEntries = Object.entries(watch);

		// Setup watchers (watches only top-level reactive state changes)
		for (let i = 0; i < watchEntries.length; i++) {
			const [, watchConfig] = watchEntries[i];
			const { deps = [], handler } = watchConfig;
			
			const prevValues = {};
			let initialized = false;

			effect(() => {
				const newValues = {};
				const oldValues = {};
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
					handler.call(publicContextMembrane, newValues, oldValues);
				}
				
				initialized = true;
			}, watcherScope);
		}

		// Register new style for CSS scoping
		if (!styleMounted && scopeId !== null) {
			registerScope(scopeId, style);
			styleMounted = true;
		}

		const html = typeof template === "function" ? 
			template(publicContextMembrane) : template;

		return {
			name: compName,
			template: html,
			scopeId,
			context: internalContext, // Handed over with open VM access
			publicContext: publicContextMembrane,

			onMount(root) {
				onMount?.(root, publicContextMembrane);
			},

			onUnmount(root) {
				try {
					runScopeCleanup(watcherScope, "[component]");
					runScopeCleanup(computedScope, "[component computed]");
					onUnmount?.(root, publicContextMembrane);

				} catch (err) {
					console.warn(
						`[createComponent] onUnmount error in Component "${compName}":`, 
						err
					);
				}
			},
		};
	}

	return (props = {}) => {
		// Register this component
		const placeholder = addComponent(Component, props);

		// return the component insertion placeholder
		return placeholder;
	};
}
