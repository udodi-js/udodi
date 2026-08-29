/**
 * index.d.ts — Public API for Udodi
 *
 * Mirrors packages/index.js. Keep this file in sync when exports change.
 *
 * @packageDocumentation
 */

export as namespace Udodi;

/* ================================================================== */
/* Shared helpers                                                     */
/* ================================================================== */

/** Lifecycle status shared by queries and mutations. */
export type AsyncStatus =
	| "idle"
	| "loading"
	| "success"
	| "error"
	| "cancelled";

/** Optional scope used to auto-dispose effects / computed values. */
export interface EffectScope {
	effects: Array<() => void>;
}

/* ================================================================== */
/* Component runtime                                                  */
/* ================================================================== */

/**
 * Watcher configuration for top-level reactive state keys.
 *
 * Only first-level keys are tracked. Nested mutations require
 * replacing the parent value or calling `touch()`.
 */
export interface WatchConfig {
	/** State keys to observe. */
	deps: string[];
	
	/**
	 * Called after a change is detected (not on the initial setup pass).
	 * `this` is the component context.
	 */
	handler: (
		this: ComponentContext,
		newValues: Record<string, any>,
		oldValues: Record<string, any>,
	) => void;
}

/**
 * Definition object passed to `createComponent`.
 *
 * @typeParam TState - Shape of the reactive state object.
 * @typeParam TProps - Shape of the props accepted by the factory.
 *
 * @example
 * const Counter = createComponent({
 *   name: "Counter",
 *   state: () => ({ count: 0 }),
 *   methods: {
 *     increment() { this.count++; }
 *   },
 *   template: () => html`
 *     <button ⁣@on="click=increment" ⁣@text="count"></button>
 *   `
 * });
 */
export interface ComponentDefinition<
	TState extends Record<string, any> = Record<string, any>,
	TProps extends Record<string, any> = Record<string, any>,
> {
	/**
	 * Display name used in warnings, errors, and debug messages.
	 * When omitted or empty, the runtime uses `"Unknown"`.
	 */
	name?: string;

	/**
	 * Factory that returns a **fresh** state object per instance.
	 * Must return a plain object (not null / array).
	 * State is shallow-reactive only.
	 */
	state?: () => TState;

	/**
	 * Derived values. Each function receives the public component context
	 * and is turned into a lazy computed getter.
	 */
	computed?: Record<
		string,
		(ctx: ComponentContext<TState, TProps>) => any
	>;

	/**
	 * Interceptors run before a state write.
	 * Return a transformed value, or `undefined` to cancel the update.
	 */
	interceptors?: Record<string, (value: any) => any>;

	/**
	 * Event handlers and helpers.
	 * Available as `ctx.methodName` and via directives like `@on="click=methodName"`.
	 * Bound so that `this` is the public component context.
	 */
	methods?: Record<
		string,
		(this: ComponentContext<TState, TProps>, ...args: any[]) => any
	>;

	/**
	 * Watchers for top-level reactive state changes.
	 * Keys are arbitrary labels; the important fields are `deps` + `handler`.
	 */
	watch?: Record<string, WatchConfig>;

	/**
	 * The CSS string. Prefer **css\`...\`** for syntax highlighting
	 * and formatting.
	 */
	style?: string;

	/**
	 * The template string or function that returns HTML.
	 * Prefer **html\`...\`** for editor highlighting.
	 */
	template: string | ((ctx: ComponentContext<TState, TProps>) => string);

	/** Called after the component is mounted into the DOM. */
	onMount?: (root: HTMLElement, ctx: ComponentContext<TState, TProps>) => void;

	/** Called just before the component is unmounted. */
	onUnmount?: (
		root: HTMLElement,
		ctx: ComponentContext<TState, TProps>,
	) => void;
}

/**
 * Public context surface available in templates, methods,
 * computed functions, and lifecycle hooks.
 *
 * It is a flat membrane over state, props, computed values,
 * methods, refs, and the framework `ud` namespace.
 */
export type ComponentContext<
	TState extends Record<string, any> = Record<string, any>,
	TProps extends Record<string, any> = Record<string, any>,
> = TState &
	TProps & {
		/** Component name (for debugging). */
		readonly name: string;

		/** Elements registered via the `@ref` directive. */
		readonly refs: Record<string, HTMLElement | undefined>;

		/**
		 * Register a cleanup callback that runs on unmount.
		 * Injected by the runtime after mount.
		 */
		cleanup(fn: () => void): void;

		/**
		 * Framework namespace (forms, etc.). Treat as read-only.
		 * Currently exposes `ud.forms` used by `@form` / `@submit`.
		 */
		readonly ud: {
			forms: Record<string, any>;
			readonly [key: string]: any;
		};
	};

/**
 * Internal instance shape produced when a component factory is invoked
 * by the runtime. Consumers normally only see the placeholder string
 * returned by the public factory.
 */
export interface ComponentInstance {
	name: string;
	template: string;
	scopeId: string | null;
	context: Record<string, any>;
	publicContext: ComponentContext;
	onMount(root: HTMLElement): void;
	onUnmount(root: HTMLElement): void;
}

/**
 * Component factory produced by `createComponent`.
 * Call with optional props to obtain a mountable placeholder
 * that you pass to `render()`.
 */
export type ComponentFactory<
	TProps extends Record<string, any> = Record<string, any>,
> = (props?: TProps) => string;

/**
 * Create a reusable component factory.
 *
 * @remarks
 * - State is **shallow-reactive**. Nested objects are not auto-proxied.
 * - Props are static snapshots unless wrapped with `bindProp()`.
 * - All root-level keys (state, computed, methods, props) must be unique.
 *
 * @example
 * const Counter = createComponent({
 *   name: "Counter",
 *   state: () => ({ count: 0 }),
 *   methods: {
 *     increment() { this.count++; }
 *   },
 *   template: () => html`
 *     <button ⁣@on="click=increment" ⁣@text="count"></button>
 *   `
 * });
 *
 * render(Counter(), "#app");
 */
export function createComponent<
	TState extends Record<string, any> = Record<string, any>,
	TProps extends Record<string, any> = Record<string, any>,
>(def: ComponentDefinition<TState, TProps>): ComponentFactory<TProps>;

/**
 * HTML tagged template (currently a pass-through of `String.raw`).
 * Use for syntax highlighting and future tooling.
 *
 * @example
 * template: () => html`<div ⁣@text="title"></div>`
 */
export const html: (
	strings: TemplateStringsArray,
	...values: any[]
) => string;

/**
 * CSS tagged template for component `style` fields.
 * Currently a pass-through of `String.raw`.
 *
 * @example
 * style: css`
 *   :scope { color: tomato; }
 * `
 */
export const css: (
	strings: TemplateStringsArray,
	...values: any[]
) => string;

/**
 * Result of a successful `render()` call.
 */
export interface MountedInstance {
	/** Component display name. */
	name: string;
	/** Public component context (state, methods, refs, etc.). */
	context: ComponentContext;
	/** Unmount this instance and run its cleanups. */
	unmount(): void;
}

/**
 * Mount a component placeholder into a DOM target.
 *
 * @param placeholder - Result of calling a component factory, e.g. `Counter()`
 * @param target      - Element or CSS selector
 * @returns Mounted instance with `name`, `context`, and `unmount()`
 *
 * @throws If the target cannot be resolved or the placeholder is invalid
 *
 * @example
 * const instance = render(Counter({ start: 10 }), "#app");
 * instance.context.count; // access reactive state
 * instance.unmount();
 */
export function render(
	placeholder: string,
	target: HTMLElement | string,
): MountedInstance;

/**
 * Unmount any Udodi instance rooted at `target`.
 * Clears the container’s contents and runs registered cleanups.
 *
 * @param target - Element or CSS selector
 *
 * @example
 * unmount("#app");
 */
export function unmount(target: HTMLElement | string): void;

/* ================================================================== */
/* Overlay / modal                                                    */
/* ================================================================== */

/**
 * Configuration for `openModal`.
 */
export interface OpenModalOptions {
	/** Render the dimmed backdrop. @default true */
	renderBackdrop?: boolean;
	/** Close when the backdrop is clicked. @default true */
	closeOnBackdrop?: boolean;
	/** Close on Escape (top modal only). @default true */
	closeOnEscape?: boolean;
	/** Lock document scroll while open. @default true */
	lockScroll?: boolean;
	/** Trap Tab focus inside the dialog. @default true */
	focusTrap?: boolean;
	/** Inline z-index on the overlay host (overrides default 9999). */
	zIndex?: number | string;
	/** Extra class name(s) on the overlay host. */
	className?: string;
}

/**
 * Open a modal overlay.
 *
 * @param renderFn - Receives `close(result?)` and returns an HTML content string
 *                   (or a component placeholder produced by a `createComponent` factory)
 * @param options  - Overlay configuration
 * @returns Promise that resolves with the value passed to `close()`
 *
 * @example
 * // Recommended: modal content as a Udodi component.
 * // The factory returns a placeholder string that the overlay
 * // mount path expands into a real component instance.
 * const ConfirmDialog = createComponent({
 *   name: "ConfirmDialog",
 *   methods: {
 *     confirm() { this.close(true); },
 *     cancel()  { this.close(false); }
 *   },
 *   template: () => html`
 *     <div class="dialog">
 *       <p>Are you sure?</p>
 *       <button ⁣@on="click=confirm">Yes</button>
 *       <button ⁣@on="click=cancel">No</button>
 *     </div>
 *   `
 * });
 *
 * const confirmed = await openModal(
 *   (close) => ConfirmDialog({ close }),
 *   { closeOnBackdrop: false }
 * );
 *
 * if (confirmed) {
 *   // user chose Yes
 * }
 */
export function openModal<T = any>(
	renderFn: (close: (result?: T) => void) => string,
	options?: OpenModalOptions,
): Promise<T | undefined>;

/**
 * Close the top-most modal.
 *
 * @param result - Value forwarded to the Promise returned by `openModal`
 *
 * @example
 * closeTopModal(false);
 */
export function closeTopModal(result?: any): void;

/* ================================================================== */
/* Reactivity                                                         */
/* ================================================================== */

export type SignalGetter<T> = () => T;
export type SignalSetter<T> = (value: T) => void;
export type SignalTrigger = () => void;

/**
 * Create a reactive signal.
 *
 * @returns Tuple `[get, set, trigger]`
 *
 * @example
 * const [count, setCount, trigger] = createSignal(0);
 *
 * effect(() => console.log(count()));
 * setCount(5);
 *
 * // In-place mutation of a nested object:
 * const [user, , triggerUser] = createSignal({ name: "John" });
 * user().name = "Jane";
 * triggerUser();
 */
export function createSignal<T>(
	initialValue: T,
): [SignalGetter<T>, SignalSetter<T>, SignalTrigger];

/**
 * Notify dependents after an in-place mutation of a shallow-reactive property.
 *
 * @param proxy - Object returned by `reactive()` (or a component context)
 * @param key   - Root property that was mutated
 * @returns `true` if a trigger was found and fired
 *
 * @example
 * // Shallow reactive state is only tracked at the root key.
 * // Mutating nested object fields requires manually touching the parent key.
 * state.user.name = "Jane";
 * touch(state, "user");
 */
export function touch(proxy: object, key: PropertyKey): boolean;

/**
 * Create a shallow reactive object backed by per-property signals.
 *
 * Nested objects / arrays are **not** made reactive automatically
 * (arrays, Maps and Sets receive lightweight reactive wrappers).
 *
 * @example
 * const state = reactive(
 *   { count: 0, age: 18 },
 *   {
 *     interceptors: {
 *       age(v) { return Math.max(0, Number(v)); }
 *     }
 *   }
 * );
 *
 * effect(() => console.log(state.count));
 * state.count++;
 */
export function reactive<T extends object>(
	initialState?: T,
	options?: { interceptors?: Record<string, (value: any) => any> },
): T;

/**
 * Lazily-evaluated computed value.
 * Tracks reactive dependencies and recomputes only when they change.
 *
 * @param fn    - Computation function
 * @param scope - Optional scope whose `effects` array receives the disposer
 * @returns Reactive getter
 *
 * @example
 * const fullName = computed(() => `${state.first} ${state.last}`);
 * effect(() => console.log(fullName()));
 */
export function computed<T>(fn: () => T, scope?: EffectScope): () => T;

/**
 * Run a reactive effect. Any signals/computed values read inside
 * are tracked; the effect re-runs when they change.
 *
 * @returns Dispose function
 *
 * @example
 * const stop = effect(() => {
 *   console.log("count is", state.count);
 * });
 * 
 * // later
 * stop();
 */
export function effect(fn: () => void, scope?: EffectScope): () => void;

/**
 * Opaque marker returned by `bindProp()`.
 * The child receives a live tunnel into the parent signal, not a plain value.
 */
export interface ReactiveBinding<T> {
	readonly value: T;
}

/**
 * Mark a prop as a live reactive binding from parent to child.
 * Without `bindProp`, props are static snapshots.
 *
 * @example
 * // Live connection – parent changes flow into the child
 * Child({ count: bindProp(() => ctx.count) })
 *
 * // Static snapshot
 * Child({ count: ctx.count })
 */
export function bindProp<T>(getter: () => T): ReactiveBinding<T>;

/* ================================================================== */
/* Store                                                              */
/* ================================================================== */

/**
 * Context object passed to every store action
 * (global actions and module actions share the same shape).
 *
 * @typeParam TState - Map of key → value for this action’s state scope
 */
export interface ActionContext<
	TState extends Record<string, any> = Record<string, any>,
> {
	/** Reactive state proxy for the current scope. */
	state: TState;
	get<K extends keyof TState & string>(key: K): TState[K];
	get(key: string): any;
	set<K extends keyof TState & string>(key: K, value: TState[K]): void;
	set(key: string, value: any): void;
	update<K extends keyof TState & string>(
		key: K,
		fn: (prev: TState[K]) => TState[K],
	): void;
	update(key: string, fn: (prev: any) => any): void;
	touch(key: string): boolean;
	select<T>(
		selector: (storeOrCtx: ActionContext<TState>) => T,
		scope?: EffectScope,
	): () => T;
}

/**
 * Definition for a namespaced store module registered via `defineStore`.
 *
 * @typeParam TState - Initial state shape for the module
 */
export interface StoreModuleDefinition<
	TState extends Record<string, any> = Record<string, any>,
> {
	/** Initial state values. */
	state?: TState;
	/** Action handlers; receive `(ctx, payload)`. */
	actions?: Record<
		string,
		(ctx: ActionContext<TState>, payload?: any) => any
	>;
	/** Cleanup hook called when the module is destroyed. */
	cleanup?: (api: StoreModuleApi<TState>) => void;
}

/**
 * Options accepted by `store.persist`.
 * Values are written to IndexedDB under the given database / store names.
 */
export interface PersistOptions {
	/** IndexedDB database name. @default "udodi-store" */
	dbName?: string;
	/** IndexedDB object-store name. @default "state" */
	storeName?: string;
	/**
	 * Whether to restore saved values before subscribing to further changes.
	 * @default true
	 */
	hydrate?: boolean;
	/**
	 * When `true`, writing `undefined` removes the persisted entry.
	 * @default true
	 */
	removeOnUndefined?: boolean;
	/**
	 * Delay writes by this many milliseconds (debouncing).
	 * `0` flushes on the next microtask.
	 * @default 0
	 */
	debounce?: number;
	/** Called when an IndexedDB operation fails. */
	onError?: (error: unknown) => void;
	/**
	 * Internal key prefix (used by namespaced store modules).
	 * Prefer letting `defineStore` set this.
	 */
	_prefix?: string;
}

/**
 * Controller returned by `store.persist`.
 */
export interface PersistController {
	/** Local store keys being persisted. */
	keys: string[];
	/**
	 * Resolves after IndexedDB opens and (optional) hydration finishes.
	 * Resolves to `true` on success, `false` when persistence is inactive
	 * or an error occurred.
	 */
	ready: Promise<boolean>;
	/** Write any pending values immediately. */
	flush(): Promise<boolean>;
	/**
	 * Remove persisted values for the configured keys.
	 * Persistence remains active after `clear()`.
	 */
	clear(): Promise<boolean>;
	/**
	 * Stop syncing future changes.
	 * Data already stored in IndexedDB is retained.
	 */
	stop(): void;
}

/**
 * Options for `store.dispatch` / module `dispatch`.
 */
export interface DispatchOptions {
	/** Throw when the action is not registered. */
	throwOnMissing?: boolean;
	/** Stricter missing-action behavior used by some module paths. */
	strict?: boolean;
}

/**
 * Global key-value reactive store.
 *
 * Values are untyped at the global surface because keys are free-form
 * strings. Prefer `defineStore` when you want a typed state shape.
 *
 * @example
 * store.set("user", { name: "Ada" });
 * store.subscribe("user", (next, prev) => console.log(next));
 *
 * store.defineAction("login", async (ctx, payload) => {
 *   ctx.set("user", payload);
 * });
 * await store.dispatch("login", { name: "Ada" });
 */
export interface StoreApi {
	get(key: string): any;
	set(key: string, value: any): void;
	update(key: string, fn: (prev: any) => any): void;
	touch(key: string): boolean;
	delete(key: string): void;
	has(key: string): boolean;
	keys(): string[];
	clear(): void;

	defineAction(
		name: string,
		fn: (ctx: ActionContext, payload?: any) => any,
	): void;
	dispatch(
		name: string,
		payload?: any,
		options?: DispatchOptions,
	): Promise<any> | undefined;
	hasAction(name: string): boolean;
	deleteAction(name: string): void;

	select<T>(selector: (s: StoreApi) => T, scope?: EffectScope): () => T;
	subscribe(
		key: string,
		cb: (next: any, prev: any) => void,
	): () => void;
	persist(keys: string | string[], options?: PersistOptions): PersistController;
}

/**
 * Global key-value reactive store.
 *
 * @example
 * store.set("theme", "dark");
 * const theme = store.get("theme");
 */
export const store: StoreApi;

/**
 * Run a function inside a batch transaction.
 * State writes are deferred until the batch ends.
 *
 * @example
 * batch(() => {
 *   store.set("a", 1);
 *   store.set("b", 2);
 * }); // subscribers notified once
 */
export function batch<T>(fn: () => T): T;

/**
 * Public API of a module registered with `defineStore`.
 *
 * @typeParam TState - Module state shape
 */
export interface StoreModuleApi<
	TState extends Record<string, any> = Record<string, any>,
> {
	/** Reactive state proxy for this module’s keys. */
	state: TState;

	get<K extends keyof TState & string>(key: K): TState[K];
	get(key: string): any;
	set<K extends keyof TState & string>(key: K, value: TState[K]): void;
	set(key: string, value: any): void;
	update<K extends keyof TState & string>(
		key: K,
		fn: (prev: TState[K]) => TState[K],
	): void;
	update(key: string, fn: (prev: any) => any): void;
	touch(key: string): boolean;
	delete(key: string): void;
	has(key: string): boolean;
	subscribe(
		key: string,
		cb: (next: any, prev: any) => void,
	): () => void;
	dispatch(
		action: string,
		payload?: any,
		options?: DispatchOptions,
	): Promise<any> | undefined;
	/**
	 * Create a lazily computed selector over module state.
	 * The selector receives `(stateProxy, moduleApi)`.
	 */
	select<T>(
		selector: (state: TState, api: StoreModuleApi<TState>) => T,
		scope?: EffectScope,
	): () => T;
	persist(keys: string | string[], options?: PersistOptions): PersistController;
	/** Destroy the module and run its cleanup hooks. */
	destroy(): void;
}

/**
 * Register a namespaced store module.
 * Returns the module API (or the existing one if already registered).
 *
 * @example
 * const counter = defineStore("counter", {
 *   state: { value: 0 },
 * 
 *   actions: {
 *     increment(ctx) { ctx.update("value", v => (v as number) + 1); }
 *   }
 * });
 *
 * counter.state.value;  // reactive read
 * await store.dispatch("counter:increment");
 */
export function defineStore<
	TState extends Record<string, any> = Record<string, any>,
>(name: string, def: StoreModuleDefinition<TState>): StoreModuleApi<TState>;

/**
 * Retrieve a previously registered store module.
 *
 * @example
 * const counter = useStore("counter");
 * counter?.state.value;
 */
export function useStore<
	TState extends Record<string, any> = Record<string, any>,
>(name: string): StoreModuleApi<TState> | undefined;

/**
 * Destroy a store module and run its cleanup hooks.
 *
 * @example
 * destroyStore("counter");
 */
export function destroyStore(name: string): void;

/* ================================================================== */
/* Query pool                                                         */
/* ================================================================== */

/**
 * Definition of a single query inside a Query Pool.
 *
 * A query runs either locally (`source` + optional `compute`)
 * or remotely via a registered worker `module`.
 *
 * @typeParam TData  - Resolved data type
 * @typeParam TInput - Optional input passed to `source` / worker
 */
export interface QueryDefinition<TData = any, TInput = any> {
	/**
	 * Local source function.
	 * Receives an AbortSignal (and optional input) and returns raw data.
	 */
	source?: (
		signal: AbortSignal,
		input?: TInput,
	) => TData | Promise<TData>;

	/**
	 * Optional transformation applied to the result of `source`.
	 */
	compute?: (data: TData) => TData | Promise<TData>;

	/**
	 * Key of a registered worker module.
	 * Mutually exclusive with `source` / `compute`.
	 */
	module?: string;

	/** Initial cached input used by `refresh()` until overridden. */
	input?: TInput;

	/** Enable streaming for worker-module execution. */
	stream?: boolean;

	/**
	 * Enable Transferable Object transport for input by default.
	 * Can be overridden per `fetch()` call.
	 */
	transfer?: boolean;

	/** Cache configuration. */
	cache?: {
		/** Time-to-live in milliseconds (must be ≥ 0). */
		ttl: number;
	};

	/**
	 * Keys of queries that must finish before this one runs.
	 * Independent branches execute in parallel.
	 */
	dependsOn?: string[];
}

/**
 * Options for creating a Query Pool.
 */
export interface QueryPoolOptions {
	worker?: {
		/** Enable worker-based execution. @default false */
		enabled?: boolean;
		/** Number of compute workers. */
		computeWorkers?: number;
	};
	/**
	 * Optional shared module registry created by the query package.
	 * Pass the same instance when multiple pools should share modules.
	 */
	registry?: QueryModuleRegistry;
}

/**
 * Minimal surface of a shared query-module registry.
 * Concrete implementation lives in the query package.
 */
export interface QueryModuleRegistry {
	register(key: string, definition: QueryModuleDefinition): QueryModuleDescriptor;
	registerAll(
		definitions: Record<string, QueryModuleDefinition>,
	): QueryModuleDescriptor[];
	get(key: string): QueryModuleDescriptor | undefined;
	remove(key: string): boolean;
}

/** Options accepted by `QueryHandle.fetch`. */
export interface QueryFetchOptions<TInput = any> {
	input?: TInput;
	transfer?: boolean;
	force?: boolean;
	/** When true, run upstream `dependsOn` queries before this fetch. */
	dependencies?: boolean;
}

/** Options accepted by `QueryHandle.refresh` / `QueryPool.refresh`. */
export interface QueryRefreshOptions {
	force?: boolean;
	/** Also refresh downstream dependents after this query. */
	dependents?: boolean;
}

/** Entry accepted by mutation `invalidates`. */
export type QueryInvalidateEntry =
	| string
	| { key: string; dependents?: boolean; force?: boolean };

/**
 * Context passed to mutation lifecycle hooks (`onMutate`, `onSuccess`, `onError`).
 */
export interface MutationContext {
	/** The pool that owns this mutation. */
	pool: QueryPool;
	getQueryData(key: string): any;
	setQueryData(
		key: string,
		updater: any | ((previous: any) => any),
	): boolean;
}

/**
 * Definition of a mutation inside a Query Pool.
 *
 * @typeParam TData      - Result type of a successful mutate
 * @typeParam TVariables - Input / variables type
 *
 * @example
 * const def: MutationDefinition<User, { name: string }> = {
 *   execute: async (input, { signal }) => {
 *     const res = await fetch("/api/users", {
 *       method: "POST",
 *       body: JSON.stringify(input),
 *       signal
 *     });
 *     return res.json();
 *   },
 * 
 *   invalidates: ["users"]
 * };
 */
export interface MutationDefinition<TData = any, TVariables = any> {
	execute?: (
		input: TVariables,
		context: {
			signal: AbortSignal;
			stream: (chunk: any) => void;
			endStream: () => void;
		},
	) => TData | Promise<TData>;
	module?: string;
	stream?: boolean;
	defaults?: {
		transfer?: boolean;
	};
	onMutate?: (
		input: TVariables,
		context: MutationContext,
	) => any | Promise<any>;
	onError?: (
		error: unknown,
		input: TVariables,
		context: MutationContext,
	) => any | Promise<any>;
	onSuccess?: (
		result: TData,
		input: TVariables,
		context: MutationContext,
	) => any | Promise<any>;
	invalidates?: QueryInvalidateEntry[];
}

/**
 * Public handle returned for each registered mutation.
 *
 * @typeParam TData      - Result type
 * @typeParam TVariables - Input type
 */
export interface MutationHandle<TData = any, TVariables = any> {
	readonly data: TData | undefined;
	readonly variables: TVariables | undefined;
	readonly chunks: any[];
	readonly error: unknown;
	readonly loading: boolean;
	readonly streaming: boolean;
	readonly streamed: boolean;
	readonly status: AsyncStatus;
	mutate(
		input: TVariables,
		options?: {
			transfer?: boolean;
			force?: boolean;
			skipInvalidation?: boolean;
			awaitInvalidations?: boolean;
		},
	): Promise<TData>;
	cancel(): void;
	reset(): void;
}

/** Worker module registration payload. */
export interface QueryModuleDefinition {
	url: string;
	queryExport?: string;
	defaultExport?: string | null;
	metadata?: Record<string, any>;
}

/** Descriptor returned after registering a worker module. */
export interface QueryModuleDescriptor {
	key: string;
	url: string;
	queryExport: string;
	defaultExport: string | null;
	metadata?: Record<string, any>;
	revision: number;
}

/**
 * Public handle returned for each registered query.
 *
 * @typeParam TData  - Resolved data type
 * @typeParam TInput - Input type accepted by `fetch`
 */
export interface QueryHandle<TData = any, TInput = any> {
	readonly data: TData | undefined;
	readonly chunks: any[];
	readonly error: unknown;
	readonly loading: boolean;
	readonly streaming: boolean;
	readonly streamed: boolean;
	readonly status: AsyncStatus;

	/**
	 * Execute the query (optionally with explicit input).
	 * By default only this query runs; set `dependencies: true` to
	 * load upstream `dependsOn` entries first.
	 */
	fetch(opts?: QueryFetchOptions<TInput>): Promise<TData>;

	/**
	 * Re-run through the dependency execution plan.
	 * @param opts.force       - Bypass cache and restart execution.
	 * @param opts.dependents  - Also refresh downstream dependents after this query.
	 */
	refresh(opts?: QueryRefreshOptions): Promise<TData>;

	/** Abort any in-flight execution. */
	cancel(): void;

	/** Reset query state to idle. */
	reset(): void;

	/** Mark cached query data as stale. */
	invalidate(): void;
}

/**
 * Public API of a Query Pool instance.
 *
 * Created by {@link createQueryPool}. Manages local and/or worker-backed
 * queries, mutations, dependency graphs, caching, and optional streaming.
 */
export interface QueryPool {
	/**
	 * Register a query (or return the existing handle if the key is already registered).
	 *
	 * Builds reverse dependency edges for `dependsOn` and starts an initial
	 * execution plan (dependencies first). Independent dependency branches
	 * run in parallel.
	 *
	 * @param key        - Unique query key
	 * @param definition - Local (`source` / `compute`) or worker (`module`) definition
	 * @returns Query handle with `fetch`, `refresh`, `cancel`, etc.
	 *
	 * @example
	 * pool.query("users", {
	 *   source: async (signal) => {
	 *     const res = await fetch("/api/users", { signal });
	 *     return res.json();
	 *   },
	 * 
	 *   cache: { ttl: 60_000 }
	 * });
	 *
	 * pool.query("posts", {
	 *   dependsOn: ["users"],
	 * 
	 *   source: async (signal) => {
	 *     const res = await fetch("/api/posts", { signal });
	 *     return res.json();
	 *   }
	 * });
	 */
	query<TData = any, TInput = any>(
		key: string,
		definition: QueryDefinition<TData, TInput>,
	): QueryHandle<TData, TInput>;

	/**
	 * Read the current cached data for a query without triggering a fetch.
	 *
	 * @param key - Query key
	 * @returns Cached data, or `undefined` if the query does not exist / has no data yet
	 *
	 * @example
	 * const users = pool.data("users");
	 */
	data(key: string): any;

	/**
	 * Write reactive query data without going through `source` / worker module.
	 *
	 * Used by mutation `onMutate` / `onError` for optimistic updates and rollbacks.
	 *
	 * @param key     - Query key
	 * @param updater - Next value, or a function `(previous) => next`
	 * @returns `true` when the query exists and was updated; otherwise `false`
	 *
	 * @example
	 * // Replace
	 * pool.setQueryData("users", [{ id: 1, name: "Ada" }]);
	 *
	 * // Update from previous
	 * pool.setQueryData("users", (prev = []) => [
	 *   ...prev,
	 *   { id: 2, name: "Grace" }
	 * ]);
	 */
	setQueryData(
		key: string,
		updater: any | ((previous: any) => any),
	): boolean;

	/**
	 * Refresh a query by key through the dependency execution plan.
	 *
	 * Dependencies execute first. Independent branches run in parallel.
	 *
	 * @param key  - Query key
	 * @param opts.force      - Cancel in-flight work where applicable and re-execute
	 * @param opts.dependents - Also schedule queries that depend on this key after the plan completes
	 * @returns Promise resolving to the root query’s data
	 *
	 * @example
	 * await pool.refresh("users");
	 * await pool.refresh("users", { force: true, dependents: true });
	 */
	refresh(key: string, opts?: QueryRefreshOptions): Promise<any>;

	/**
	 * Register a mutation (or return the existing handle if the key is already registered).
	 *
	 * Mutations can run locally via `execute` or on a worker via `module`,
	 * support optimistic updates (`onMutate`), and invalidate queries on success.
	 *
	 * @param key        - Unique mutation key
	 * @param definition - Mutation definition
	 * @returns Mutation handle with `mutate`, `cancel`, `reset`
	 *
	 * @example
	 * const createUser = pool.mutation("createUser", {
	 *   execute: async (input, { signal }) => {
	 *     const res = await fetch("/api/users", {
	 *       method: "POST",
	 *       body: JSON.stringify(input),
	 *       signal
	 *     });
	 * 
	 *     return res.json();
	 *   },
	 * 
	 *   onMutate(input, ctx) {
	 *     const previous = ctx.getQueryData("users");
	 *     ctx.setQueryData("users", (prev = []) => [...prev, input]);
	 *     return { previous };
	 *   },
	 * 
	 *   onError(_err, _input, ctx) {
	 *     // rollback using context from onMutate if you stored it
	 *   },
	 * 
	 *   invalidates: ["users"]
	 * });
	 *
	 * await createUser.mutate({ name: "Ada" });
	 */
	mutation<TData = any, TVariables = any>(
		key: string,
		definition: MutationDefinition<TData, TVariables>,
	): MutationHandle<TData, TVariables>;

	/**
	 * Get a registered mutation handle by key.
	 *
	 * @param key - Mutation key
	 * @returns Mutation handle, or `undefined` if not registered
	 *
	 * @example
	 * const createUser = pool.getMutation("createUser");
	 * await createUser?.mutate({ name: "Ada" });
	 */
	getMutation(key: string): MutationHandle | undefined;

	/**
	 * Whether a mutation key is registered.
	 *
	 * @param key - Mutation key
	 *
	 * @example
	 * if (pool.hasMutation("createUser")) { ... }
	 */
	hasMutation(key: string): boolean;

	/**
	 * Register a worker module used by queries/mutations that set `module`.
	 *
	 * @param key        - Module key referenced by `QueryDefinition.module` / `MutationDefinition.module`
	 * @param definition - Module URL and export names
	 * @returns Descriptor for the registered module
	 *
	 * @example
	 * pool.registerModule("analytics", {
	 *   url: new URL("./workers/analytics.js", import.meta.url).href,
	 *   queryExport: "runQuery"
	 * });
	 *
	 * pool.query("report", { module: "analytics", input: { range: "7d" } });
	 */
	registerModule(
		key: string,
		definition: QueryModuleDefinition,
	): QueryModuleDescriptor;

	/**
	 * Register multiple worker modules at once.
	 *
	 * @param definitions - Map of module key by definition
	 * @returns Array of descriptors
	 *
	 * @example
	 * pool.registerModules({
	 *   analytics: { url: "/workers/analytics.js", queryExport: "runQuery" },
	 *   search:    { url: "/workers/search.js",    queryExport: "search" }
	 * });
	 */
	registerModules(
		definitions: Record<string, QueryModuleDefinition>,
	): QueryModuleDescriptor[];

	/**
	 * Look up a registered worker module descriptor.
	 *
	 * @param key - Module key
	 * @returns Descriptor, or `undefined` if not registered
	 *
	 * @example
	 * const mod = pool.getModule("analytics");
	 */
	getModule(key: string): QueryModuleDescriptor | undefined;

	/**
	 * Remove a registered worker module.
	 *
	 * @param key - Module key
	 * @returns `true` if a module was removed
	 *
	 * @example
	 * pool.removeModule("analytics");
	 */
	removeModule(key: string): boolean;

	/**
	 * Get a registered query handle by key.
	 *
	 * @param key - Query key
	 * @returns Query handle, or `undefined` if not registered
	 *
	 * @example
	 * const users = await pool.get("users")?.fetch();
	 */
	get(key: string): QueryHandle | undefined;

	/**
	 * Whether a query key is registered.
	 *
	 * @param key - Query key
	 *
	 * @example
	 * if (pool.has("users")) {
	 *   await pool.refresh("users");
	 * }
	 */
	has(key: string): boolean;

	/**
	 * Cancel in-flight mutations, terminate the worker bridge (if any),
	 * and release pool resources.
	 *
	 * Call when the pool is no longer needed (e.g. app teardown).
	 *
	 * @example
	 * pool.terminate();
	 */
	terminate(): void;
}

/**
 * Create a Query Pool that manages local and/or worker-backed queries
 * with dependency tracking, caching, and optional streaming.
 *
 * @example
 * const pool = createQueryPool({ worker: { enabled: true } });
 *
 * pool.query("users", {
 *   source: async (signal) => {
 *     const res = await fetch("/api/users", { signal });
 *     return res.json();
 *   },
 * 
 *   cache: { ttl: 60_000 }
 * });
 *
 * pool.query("posts", {
 *   dependsOn: ["users"],
 * 
 *   source: async (signal) => {
 *     const res = await fetch("/api/posts", { signal });
 *     return res.json();
 *   }
 * });
 *
 * const users = await pool.get("users")?.fetch();
 */
export function createQueryPool(options?: QueryPoolOptions): QueryPool;

export {};
