# Udodi User Guide

Udodi is a small reactive component runtime built around declarative HTML directives, path-level reactive state, lifecycle cleanup, and optional shared stores.

This guide reflects the current implementation in `packages/`.

## Quick Start

Import from the public entry file:

```javascript
import { createComponent, render } from "udodi";
```

Create a component:

```javascript
export const Counter = createComponent({
	name: "counter",

	state: {
		count: 0,
	},

	handlers: {
		increment(ctx) {
			ctx.count = ctx.count + 1;
		},
	},

	template: () => `
		<button @on="click:increment">
			Count: <span @text="count"></span>
		</button>
	`,
});
```

Render the component into a target element:

```javascript
import { render } from "udodi";

render(Counter(), document.getElementById("app"));
```

`createComponent()` returns a placeholder factory. Calling `Component(props)` creates the same placeholder used for both top-level `render()` calls and nested component templates.

## Component Options

```javascript
createComponent({
	name,
	state,
	computed,
	interceptors,
	handlers,
	methods,
	watch,
	template,
	onMount,
	onUnmount,
});
```

| Option | Purpose |
| --- | --- |
| `name` | Optional label used by tooling and errors. |
| `state` | Root reactive values. Read as `ctx.key`; write as `ctx.key = value`. Can be overridden by props. |
| `computed` | Derived values. Functions receive `ctx`. Use computed values in directives by path. |
| `interceptors` | Pre-process root state assignments. Return `undefined` to cancel an update. |
| `handlers` | Event handlers. Udodi calls them as `(ctx, event, ...args)`. |
| `methods` | Utility functions bound to `ctx`. Useful as directive resolvers and helpers. |
| `watch` | Batched watchers for path dependencies. Only tracks top-level key changes. |
| `template` | HTML string or function returning an HTML string. |
| `onMount` | Runs after DOM binding. Receives `(root, ctx)`. |
| `onUnmount` | Runs before cleanup. Receives `(root, ctx)`. |

## State Model

State is reactive at the **top level only** (shallow reactivity):

```javascript
state: {
	user: {
		firstName: "Jane",
		lastName: "Doe",
	},
	coupon: "",
}
```

Read values directly:

```javascript
handlers: {
	logUser(ctx) {
		console.log(ctx.user.firstName);
	}
}
```

Write root values directly:

```javascript
handlers: {
	resetUser(ctx) {
		ctx.user = {
			firstName: "John",
			lastName: "Smith",
		};
	}
}
```

**Important:** Nested objects are NOT auto-proxied. Directly mutating nested properties (e.g., `ctx.user.firstName = "John"`) will NOT trigger reactivity or watchers. To update nested state, replace the entire root object:

```javascript
handlers: {
	setFirstName(ctx, event) {
		ctx.user = {
			...ctx.user,
			firstName: event.target.value,
		};
	}
}
```

Template directives can read nested paths such as `user.firstName`. `@bind="user.firstName"` will automatically update by replacing the root object for you.

## Computed Values

Computed values are derived from state and update when their dependencies update:

```javascript
export const ProfileName = createComponent({
	state: {
		user: {
			firstName: "Jane",
			lastName: "Doe",
		},
	},

	computed: {
		fullName(ctx) {
			return `${ctx.user.firstName} ${ctx.user.lastName}`;
		},
	},

	template: () => `
		<h2 @text="fullName"></h2>
	`,
});
```

Prefer using computed values through directives such as `@text`, `@class`, `@attr`, or `@show`.

## Interceptors

Interceptors run before a root state value is committed:

```javascript
export const CouponInput = createComponent({
	state: {
		coupon: "",
		phoneNumber: "",
	},

	interceptors: {
		coupon(value) {
			return value.toUpperCase();
		},

		phoneNumber(value) {
			const onlyNumbers = value.replace(/\D/g, "");
			return value === onlyNumbers ? value : undefined;
		},
	},

	template: () => `
		<div>
			<input @bind="coupon" placeholder="Coupon">
			<input @bind="phoneNumber" placeholder="Phone number">
		</div>
	`,
});
```

Returning `undefined` cancels the update.

## Event Handlers

Use `@on="event:handler"`:

```html
<button @on="click:save">Save</button>
<form @on="submit.prevent:submit"></form>
<input @on="keydown.enter:search keydown.esc:clear">
```

Multiple bindings are space-separated:

```html
<button @on="mouseenter:preview mouseleave:clearPreview click.prevent:select">
	Select
</button>
```

Supported modifiers:

| Modifier | Behavior |
| --- | --- |
| `.prevent` | Calls `event.preventDefault()`. |
| `.stop` | Calls `event.stopPropagation()`. |
| `.self` | Runs only when `event.target === element`. |
| `.enter` | Runs only for Enter. |
| `.esc` | Runs only for Escape. |
| `.space` | Runs only for Space. |
| `.tab` | Runs only for Tab. |
| `.passive` | Uses a passive listener. |
| `.nonpassive` | Uses a non-passive listener. |

Example:

```javascript
export const SearchBox = createComponent({
	state: {
		query: "",
	},

	handlers: {
		search(ctx) {
			console.log("Searching:", ctx.query);
		},

		clear(ctx) {
			ctx.query = "";
		},
	},

	template: () => `
		<input
			@bind="query"
			@on="keydown.enter:search keydown.esc:clear"
			placeholder="Search"
		>
	`,
});
```

## Directives

All directives use `@` attributes. Directive expressions allow path-style values such as `user.firstName`.

### Directive expression rules

- Directive values may be:
  - quoted string literals: `'hello world'` or `"hello world"`
  - dot paths: `user.name`, `form.values.email`
  - resolver calls: `formatDate:createdAt:'MMM DD, YYYY'`
- Quoted strings are literal values and are not treated as paths or resolver names.
- Path tokens must be valid identifiers (`[A-Za-z_$][A-Za-z0-9_$]*`) separated by `.`.
- Event handler names in `@on` must be valid path tokens and cannot be quoted strings.
- Resolver syntax is only valid when the first segment is a path name and there is at least one `:` separator.
- Resolver arguments are parsed as tokens. Each argument is resolved as a path first; if the path does not exist, it is used as a literal string.
- Duplicate or invalid keys in `@for` are rejected with a warning.

### `@text`

Writes a value to `textContent`:

```html
<span @text="user.firstName"></span>
<strong @text="fullName"></strong>
```

## Resolver Arguments & String Literals

You can pass string literals containing special characters (including `:` , `|` , `@` , etc.) by wrapping them in single or double quotes.

```html
<!-- URLs -->
<span @text="url:'https://www.example.com'"></span>
<a @attr="href:baseUrl:'/api/users'"></a>

<!-- Strings with special characters -->
<span @text="formatInput:'user sd-:|wwr'"></span>
<span @text="message:'It\'s a test with \"quotes\"'"></span>

<!-- Multiple arguments -->
<span @text="formatDate:createdAt:'MMM DD, YYYY'"></span>
<span @text="currency:pricing.total:'USD'"></span>

The first segment is a method/resolver name on `ctx`; later segments are path values when found, or literal strings when no path exists.

### `@bind`

Two-way binding for text inputs, checkboxes, radios, and selects:

```html
<input @bind="coupon">
<input type="checkbox" @bind="accepted">
<input type="radio" value="small" @bind="size">
<input type="radio" value="large" @bind="size">
```

Nested path binding replaces the root object:

```html
<input @bind="user.firstName">
```

Resolver-based `@bind` is read-only and warns if a setter is attempted.

### `@class`

Use `className:path` to toggle a class:

```html
<button @class="'active':isActive 'disabled':isDisabled"></button>
```

Use a bare expression for a class list path or a quoted literal class list:

```html
<div @class="'panel successClass'"></div>
```

If `successClass` is a path that resolves to a string such as `"is-valid highlight"` or an array of class names, those classes are applied. Unquoted bare expressions are treated as path lookups, not as static class names, so unknown values will not be applied.
### `@attr`

Bind attributes with space-separated `attr:path` pairs:

```html
<a @attr="href:url title:label">Open</a>
<button @attr="aria-label:label disabled:isDisabled">Delete</button>
```

Values of `false`, `null`, or `undefined` remove the attribute. A value of `true` writes a boolean attribute.

### `@style`

Bind inline styles with space-separated `property:path` pairs:

```html
<div @style="color:textColor font-size:fontSize opacity:opacity"></div>
```

Kebab-case style names are converted to camelCase.

### `@if`

Conditionally mounts or removes an element:

```html
<p @if="isReady">Ready</p>
```

Use `@if` when hidden content should be removed from the DOM.

### `@show`

Toggles `display: none`:

```html
<p @show="isOpen">Details</p>
```

Use `@show` when the element should stay mounted.

### `@for` and `@key`

Render an array:

```html
<li @for="item todos">
	<span @text="item.name"></span>
</li>
```

Add an index variable:

```html
<li @for="item index todos">
	<span @text="index"></span>: <span @text="item.name"></span>
</li>
```

Use `@key` for stable identity. Existing loop items are preserved by key and reused where possible, which reduces DOM churn during reorder or insert/delete operations:

```html
<li @for="item index todos" @key="item.id">
	<input type="checkbox" @attr="checked:item.done">
	<span @text="item.text"></span>
</li>
```

If a key is missing, invalid, or duplicated, Udodi warns and skips the offending item in the loop.

`@for` templates are isolated while still inheriting parent context. Child directives inside the loop can read `item`, `index`, and parent values.

### `@ref`

Use `@ref` for imperative DOM access:

```html
<input @ref="textInput" @bind="phoneNumber">
```

Refs are available on `ctx.refs` as a map lookup:

```javascript
handlers: {
	focusInput(ctx) {
		ctx.refs.textInput.focus();
		ctx.refs.textInput.style.borderColor = "#10b981";
	}
}
```

Refs remain available on `ctx.refs` while the component context is active.

### `@teleport`

Move an element to another DOM target:

```html
<div @teleport="#modal-root">Modal content</div>
<div @teleport="overlay">Overlay content</div>
```

`overlay` resolves to `#udodi-overlay-root`.

### `@validate` and `@error`

Validation runs on `input` and `blur`:

```html
<input
	name="email"
	@bind="email"
	@validate="required email"
	@error="emailError"
>
<span @text="emailError"></span>
```

Built-in rules:

| Rule | Behavior |
| --- | --- |
| `required` | Value must not be empty. |
| `email` | Value must look like an email address. |
| `min:n` | Value must have at least `n` characters. |
| `max:n` | Value must have at most `n` characters. |

If `@error` is omitted, Udodi uses `${element.name}_error` when the element has a `name` attribute. Otherwise it falls back to `validation_error`.

Custom validator resolvers are supported:

```javascript
methods: {
	isLongEnough(value, minimum) {
		return value.length >= Number(minimum);
	}
}
```

```html
<input @validate="isLongEnough:8" @error="passwordError">
```

## Methods and Resolvers

Methods are bound to the context and can be called from handlers or used as directive resolvers:

```javascript
export const PriceTag = createComponent({
	state: {
		pricing: {
			total: 105,
		},
	},

	methods: {
		currency(value, code) {
			return new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: code,
			}).format(value);
		},
	},

	template: () => `
		<span @text="currency:pricing.total:USD"></span>
	`,
});
```

Resolver arguments are resolved as paths first. If no path exists, the argument is passed as a string literal.

## Watchers

Watchers observe top-level state keys and run after state changes. Since nested objects are not deeply proxied, watch only the top-level key:

```javascript
export const Totals = createComponent({
	state: {
		pricing: {
			subtotal: 100,
			tax: 5,
		},
	},

	watch: {
		pricingChange: {
			deps: ["pricing"],  // Watch the top-level key only
			handler(ctx, newValues, oldValues) {
				console.log("New pricing:", newValues["pricing"]);
				console.log("Old pricing:", oldValues["pricing"]);
			},
		},
	},

	template: () => `<div></div>`,
});
```

**Important:** Only top-level keys trigger watchers. Watching nested paths like `["pricing.subtotal", "pricing.tax"]` will not work as expected because:

- Direct nested mutations (e.g., `ctx.pricing.subtotal = 150`) don't trigger reactivity
- Only replacing the entire parent (e.g., `ctx.pricing = {...}`) triggers the watcher on `"pricing"`

Watchers skip their initial dependency collection run and fire only after later changes.

## Lifecycle

```javascript
export const FocusableInput = createComponent({
	state: {
		value: "",
	},

	template: () => `
		<input @ref="input" @bind="value">
	`,

	onMount(root, ctx) {
		ctx.refs.input.focus();

		const onBlur = () => console.log("blurred");
		ctx.refs.input.addEventListener("blur", onBlur);

		ctx.cleanup(() => {
			ctx.refs.input.removeEventListener("blur", onBlur);
		});
	},

	onUnmount(root, ctx) {
		console.log("component removed");
	},
});
```

Udodi automatically cleans directive effects, event listeners, watchers, and registered `ctx.cleanup()` callbacks when a component unmounts.

## Nested Components

Use one component inside another by calling its placeholder factory in the parent template:

```javascript
export const UserCard = createComponent({
	state: {
		name: "Jane",
	},

	template: () => `
		<article>
			<h2 @text="name"></h2>
		</article>
	`,
});

export const UserPage = createComponent({
	template: () => `
		<section>
			${UserCard()}
			${UserCard({ name: "John" })}
		</section>
	`,
});
```

Props are assigned onto the component context after state and computed values are created, but before handlers, methods, and watchers are initialized. Passing a prop with the same name as a state key updates that initial state key.

### Regular Props (Plain Values)

By default, props are plain value snapshots. Changes in the parent won't update the child:

```javascript
// Parent
Parent({
	state: { user: { name: "Jane" } },
	template: (ctx) => `${Child({ user: ctx.user })}`
});

// Child receives a plain object snapshot, not a reactive link
// When parent updates ctx.user, child won't see the change
```

### Reactive Props (Shared State)

Use `bindProp()` to share reactive state from parent to child. The child's prop becomes a live reference to the parent's state:

```javascript
import { createComponent, bindProp } from "udodi";

// Parent
export const Parent = createComponent({
	state: {
		user: { name: "Jane", role: "admin" }
	},

	template: (ctx) => `
		${Child({ user: bindProp(ctx.user) })}
	`
});

// Child - now ctx.user is reactively linked
export const Child = createComponent({
	template: (ctx) => `
		<p>User: <span @text="user.name"></span></p>
	`
});

// When parent updates ctx.user, child's ctx.user updates automatically
```

### Modal Example with Shared State

Modals are a common use case for reactive props:

```javascript
export const UserModal = createComponent({
	template: (ctx) => `
		<div class="modal">
			<h2>Edit User</h2>
			<input @bind="user.name" placeholder="Name">
			<button @on="click:save">Save</button>
		</div>
	`,

	handlers: {
		save(ctx) {
			console.log("Saving:", ctx.user);
		}
	}
});

export const UserPage = createComponent({
	state: {
		user: { name: "Jane" },
		showModal: false
	},

	handlers: {
		openModal(ctx) {
			ctx.showModal = true;
		}
	},

	template: (ctx) => `
		<button @on="click:openModal">Edit User</button>
		${ctx.showModal ? openModal(UserModal({ user: bindProp(ctx.user) })) : ""}
	`
});
```

When the user edits the modal form, changes to `ctx.user.name` in the modal update the parent's `ctx.user` immediately.

## Rendering and Unmounting

Render a component placeholder:

```javascript
import { render } from "udodi";

render(UserPage(), document.getElementById("app"));
render(UserCard({ name: "Jane" }), "#profile");
```

Unmount a container:

```javascript
import { unmount } from "udodi";

unmount(document.getElementById("app"));
```

The rendered component template must have exactly one root element.

## Store

Use the global store for app-level values.
Store state is reactive, so subscribers and components react automatically when store keys change:

```javascript
import { store } from "udodi";

store.set("theme", "dark");
console.log(store.get("theme"));

const unsubscribe = store.subscribe("theme", (next, prev) => {
	console.log("theme changed", prev, next);
});

unsubscribe();
```

Batch store updates:

```javascript
import { batch, store } from "udodi";

batch(() => {
	store.set("user:name", "Jane");
	store.set("user:role", "admin");
});
```

Define and dispatch actions:

```javascript
store.defineAction("session:logout", async (payload, store) => {
	store.delete("session:user");
});

await store.dispatch("session:logout");
```

## Store Modules

Register namespaced modules:

```javascript
import { registerStore } from "udodi";

export const counterStore = registerStore("counter", {
	state: {
		count: 0,
	},

	actions: {
		increment(ctx) {
			ctx.state.count = ctx.state.count + 1;
		},

		add(ctx, amount) {
			ctx.set("count", ctx.get("count") + amount);
		},
	},
});

await counterStore.dispatch("increment");
console.log(counterStore.get("count"));
```

Access a registered store module:

```javascript
import { useStore } from "udodi";

const counterStore = useStore("counter");
console.log(counterStore.get("count"));

counterStore.set("count", 10);
await counterStore.dispatch("increment");
```

Module actions receive:

| Property | Purpose |
| --- | --- |
| `ctx.state.key` | Read or assign module state. |
| `ctx.get(key)` | Read a module state key. |
| `ctx.set(key, value)` | Set a module state key. |
| `ctx.update(key, fn)` | Update from previous value. |

Destroy a module:

```javascript
import { destroyStore } from "udodi";

destroyStore("counter");
```


## Query Stores

For data-fetching patterns, use `createQuery()` to create a reusable reactive query store with caching, deduplication, retries, and scheduler support.

---

### Creating a query store

```javascript
import { createQuery } from "udodi";

export const holdersCountQuery = createQuery(
	"holdersCount",
	async (args, signal) => {
		const url = new URL("http://localhost:8080/api/getHoldersCount");

		if (args?.page) url.searchParams.set("page", args.page);
		if (args?.limit) url.searchParams.set("limit", args.limit);

		const res = await fetch(url, { signal });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return res.json();
	},
	{
		cacheTime: 60000,
		retry: 3,
		retryDelay: 1000,
		globalDedupe: true,
		onSuccess: (data, args) => console.log("Success:", data, args),
		onError: (err, args) => console.error("Error:", err, args),
	}
);
```

---

### Query store features

- `cacheTime` — cache successful results (TTL-based)
- `retry` — number of retry attempts on failure
- `retryDelay` — exponential backoff base delay
- `globalDedupe` — prevents duplicate in-flight requests per key
- `onSuccess(data, args)` — success hook
- `onError(error, args)` — error hook
- Abort-safe execution using `AbortSignal`
- Stable deep query key normalization

---

### Query state

```javascript
holdersCountQuery.get("status");      // idle | success | error
holdersCountQuery.get("data");        // response data
holdersCountQuery.get("error");       // error message
holdersCountQuery.get("isFetching");  // boolean
holdersCountQuery.get("updatedAt");   // timestamp
```

---

### Query actions

```javascript
await holdersCountQuery.dispatch("fetch", { page: 1, limit: 20 });

holdersCountQuery.dispatch("invalidate");
holdersCountQuery.dispatch("reset");
```

---

### Cleanup and invalidation

```javascript
import { cleanupQuery, invalidateQueries } from "udodi";

cleanupQuery(holdersCountQuery);

invalidateQueries("holdersCount");
```

---

### Invalidation dependencies

```javascript
import { registerInvalidationDependency, invalidateQueries } from "udodi";

registerInvalidationDependency("user:update", ["user:list"]);

invalidateQueries("user:update");
```

---

### Query key behavior

Query keys are deterministically normalized:

- Object keys are sorted
- Arrays preserve order
- Primitives are stable stringified
- Ensures identical inputs produce identical cache keys

```javascript
fetch({ page: 1, limit: 10 });
fetch({ limit: 10, page: 1 }); // same cache key
```

---

### Using Query Stores in Components

```javascript
import { createComponent } from "udodi";
import { holdersCountQuery } from "./stores/holdersCount.js";

export const HoldersPage = createComponent({
	computed: {
		isLoading() {
			return holdersCountQuery.get("isFetching");
		},

		hasError() {
			return holdersCountQuery.get("status") === "error";
		},

		totalCount() {
			return holdersCountQuery.get("data")?.count ?? 0;
		},

		updatedAt() {
			const t = holdersCountQuery.get("updatedAt");
			return t ? new Date(t).toLocaleTimeString() : null;
		},
	},

	handlers: {
		refresh() {
			return holdersCountQuery.dispatch("fetch", { page: 1, limit: 20 });
		},
	},

	template: (ctx) => `
		<section>
			<h2>Holders</h2>

			<p @if="isLoading">Loading...</p>

			<p @if="hasError">Error loading data</p>

			<p>Total: <span @text="totalCount"></span></p>

			<button @on="click:refresh">
				Refresh
			</button>

			<small @if="updatedAt">
				Updated: <span @text="updatedAt"></span>
			</small>
		</section>
	`,
});
```

---

### Key benefits

- Automatic request deduplication per query key
- Stable deep-argument caching
- Abort-safe lifecycle handling
- Retry with exponential backoff
- Memory-bounded cache layer
- Dependency-based invalidation graph
- Scheduler-compatible execution model
- Fully reactive store integration

---

### Scheduler integration

```javascript
import { registerQuerySchedule, triggerQuery } from "udodi";

registerQuerySchedule("notifications", {
	polling: {
		interval: 30000,
		immediate: true,
	},
	refetchOnFocus: true,
	refetchOnReconnect: true,
});

triggerQuery("notifications", { page: 1, limit: 20 });
```

---

### Payload behavior in scheduler

`triggerQuery(name, payload)` forwards runtime arguments into `fetch(args, signal)`.

This enables:

- Pagination updates during scheduled execution
- Dynamic filtering per tick
- Context-aware scheduled queries

The scheduler remains generic while queries remain fully parameter-driven.

## Store DevTools

For advanced debugging and monitoring, attach a DevTools object to `globalThis.__STORE_DEVTOOLS__`. The store emits events for all state changes and actions:

```javascript
// Example: Simple DevTools implementation
globalThis.__STORE_DEVTOOLS__ = {
	emit(event, payload) {
		console.log(`[Store:${event}]`, payload);
	},
};

import { store } from "udodi";

store.set("user:name", "Jane");     // Logs: [Store:set] { key: "user:name", prev: undefined, value: "Jane" }
store.delete("user:name");           // Logs: [Store:delete] { key: "user:name" }
```

**Emitted events:**

| Event | Payload | Purpose |
| --- | --- | --- |
| `"set"` | `{ key, prev, value }` | State value changed |
| `"delete"` | `{ key }` | State key removed |
| `"action:start"` | `{ name }` | Action execution began |
| `"action:end"` | `{ name }` | Action completed successfully |
| `"action:error"` | `{ name, err }` | Action threw an error |
| `"clear"` | `{}` | All state/actions cleared |

**Advanced example: Store history with time-travel:**

```javascript
globalThis.__STORE_DEVTOOLS__ = {
	history: [],
	currentIndex: -1,

	emit(event, payload) {
		// Record state snapshots
		if (event === "set") {
			this.history.push({
				timestamp: Date.now(),
				event,
				payload,
				snapshot: store.keys().reduce((acc, key) => {
					acc[key] = store.get(key);
					return acc;
				}, {}),
			});

			this.currentIndex = this.history.length - 1;
		}
	},

	// Time-travel: revert to previous state
	undo() {
		if (this.currentIndex > 0) {
			this.currentIndex--;
			const snapshot = this.history[this.currentIndex].snapshot;
			// Restore snapshot (implementation depends on your needs)
			console.log("Restored snapshot:", snapshot);
		}
	},

	// Inspect current history
	inspect() {
		return this.history;
	},
};
```

## Modals and Overlays

### Overview

Udodi overlays provide a lightweight, stack-aware modal system built on a 4-part structural model:

- **udodi-overlay-host**: Per-instance overlay frame (positioning boundary)
- **udodi-overlay-layer**: Layout + interaction boundary
- **udodi-overlay-backdrop**: Visual scrim + click-hit marker
- **udodi-overlay-panel**: User content surface

Overlays are mounted into a shared DOM root (`#udodi-overlay-root`) and managed via a JS-driven stack.

---

### Core API

#### openModal(render, options)

Opens a modal and returns a Promise resolved with the modal result.

```javascript
const result = await openModal((close) => {
	return `
		<div>
			<h3>Example Modal</h3>
			<button onclick="close(true)">OK</button>
		</div>
	`;
}, {
	closeOnBackdrop: true,
	closeOnEscape: true,
	lockScroll: true,
	renderBackdrop: true
});
```

#### render(close)

The render function receives a `close(result)` callback and must return a single-root HTML string.

The returned content is automatically injected into:

```html
<div udodi-overlay-panel></div>
```

---

### Overlay Structure

Each modal instance is rendered as:

```html
<div udodi-overlay-host>
	<div udodi-overlay-backdrop></div>

	<div udodi-overlay-layer role="dialog" aria-modal="true">
		<div udodi-overlay-panel>
			<!-- user content -->
		</div>
	</div>
</div>
```

#### Responsibilities

##### udodi-overlay-host
- Instance boundary
- Fixed positioning + full-screen containment
- z-index isolation

##### udodi-overlay-layer
- Centers content using flexbox
- Controls pointer isolation (`pointer-events: none`)
- Ensures only panel receives interaction

##### udodi-overlay-backdrop
- Visual dimming layer
- Click target for closing (if enabled)
- Does not own events directly (delegated handling)

##### udodi-overlay-panel
- User-provided UI content
- Receives all interaction events
- Isolation boundary from backdrop logic

---

### Basic Modal Example

```javascript
const confirmed = await openModal((close) => `
	<section>
		<h3>Delete item?</h3>
		<button onclick="close(true)">Delete</button>
		<button onclick="close(false)">Cancel</button>
	</section>
`, {
	closeOnBackdrop: true,
	closeOnEscape: true
});
```

---

### Component-Based Modal Example

```javascript
import { createComponent, openModal } from "udodi";

const ConfirmDialog = createComponent({
	handlers: {
		confirm(ctx) {
			ctx.close(true);
		},
		cancel(ctx) {
			ctx.close(false);
		}
	},

	template: (ctx) => `
		<section>
			<p>Delete this item?</p>
			<button @on="click:confirm">Delete</button>
			<button @on="click:cancel">Cancel</button>
		</section>
	`
});

const result = await openModal((close) =>
	ConfirmDialog({ close })
);
```

---

### Reactive State with bindProp

```javascript
import { createComponent, openModal, bindProp } from "udodi";

const EditUserModal = createComponent({
	template: (ctx) => `
		<section>
			<h2>Edit User</h2>
			<input @bind="user.name" />
			<button @on="click:save">Save</button>
		</section>
	`,

	handlers: {
		save(ctx) {
			ctx.close();
		}
	}
});

handlers: {
	editUser(ctx) {
		openModal((close) =>
			EditUserModal({
				user: bindProp(ctx.user),
				close
			}),
			{
				closeOnBackdrop: true,
				lockScroll: true
			}
		);
	}
}
```

Changes made inside the modal are reflected in parent state immediately via `bindProp()`.

---

### Configuration Options

| Option | Description |
|--------|-------------|
| closeOnBackdrop | Close modal when clicking backdrop |
| closeOnEscape | Close top-most modal on Escape |
| lockScroll | Prevent background scroll while open |
| renderBackdrop | Render backdrop element |

---

### Stack Behavior

Udodi supports multiple stacked modals:

- Only the top-most modal receives `Escape`
- Scroll lock uses reference counting
- Each modal is tracked in an internal stack
- Closing a modal restores focus to the previously active element

---

### Manual Control

#### closeTopModal(result)

Closes the top-most modal in the stack.

```javascript
closeTopModal(true);
```

#### closeModal(modal, result)

Closes a specific modal instance.

---

### Lifecycle Behavior

When a modal opens:

1. CSS is injected once (runtime styles)
2. Overlay root is created if missing (`#udodi-overlay-root`)
3. Modal is pushed to stack
4. Document scroll is locked (if enabled)
5. Focus is preserved (active element saved)
6. Modal is mounted via `mount()`

When a modal closes:

1. Component unmounts
2. Stack is updated
3. Scroll lock reference is decremented
4. Focus is restored
5. Promise resolves with result

---

### Notes

- Overlays are DOM-independent from application structure
- Focus management is automatic but minimal
- Backdrop events are delegated via event bubbling
- The system prioritizes stack correctness over DOM complexity

## App Refresh Hooks

```javascript
import { onAppRefresh, refreshApp } from "udodi";

const unsubscribe = onAppRefresh(() => {
	console.log("refresh requested");
});

refreshApp();
unsubscribe();
```

`refreshApp()` batches subscribers into a microtask and is also exposed on `window.refreshApp` in browsers.

## Reactivity Primitives

`reactive()` is the proxy primitive used by `createComponent()`:

```javascript
import { reactive, computed, effect } from "udodi";

const state = reactive({
	count: 0,
});

const doubled = computed(() => state.count * 2);

const dispose = effect(() => {
	console.log(doubled());
});

state.count = 2;
dispose();
```

`reactive()` is shallow and path-level, matching component state. Nested objects are not deeply proxied.

`createSignal()` is still exported as a low-level primitive for internals and advanced use:

```javascript
import { createSignal } from "udodi";

const [count, setCount] = createSignal(0);

console.log(count());
setCount(1);
```

Most component code should use component `state`, `computed`, and directives instead of calling primitives directly.

## Directive Reference

| Directive | Example | Purpose |
| --- | --- | --- |
| `@text` | `<span @text="fullName"></span>` | Reactive text content. |
| `@bind` | `<input @bind="email">` | Two-way form binding. |
| `@on` | `<button @on="click:save">` | Event handling. |
| `@for` | `<li @for="item:index todos">` | List rendering. |
| `@key` | `<li @key="item.id">` | Stable identity for `@for`. |
| `@if` | `<p @if="isReady">Ready</p>` | Conditional DOM mount. |
| `@show` | `<p @show="isOpen">Open</p>` | Toggle CSS display. |
| `@class` | `<div @class="active:isActive"></div>` | Class binding. |
| `@style` | `<div @style="color:textColor"></div>` | Inline style binding. |
| `@attr` | `<a @attr="href:url"></a>` | Attribute binding. |
| `@ref` | `<input @ref="emailInput">` | DOM references. |
| `@teleport` | `<div @teleport="#target"></div>` | Move DOM elsewhere. |
| `@validate` | `<input @validate="required email">` | Form validation. |

## Current Constraints

- Directive bindings are whitespace-separated, not comma-separated.
- Directive expressions are path/resolver expressions, not JavaScript expressions. Use computed values or methods for logic.
- Nested state is not deeply proxied. Replace the root value to trigger updates from handlers.
- Templates must have exactly one root element when rendered.
- `@ref` is the only supported ref directive.
- `createComponent()` returns a placeholder factory; pass `Component(props)` to `render()` or place it inside a parent template.

## Complete Example

```javascript
import { createComponent, render } from "udodi";

const TodoList = createComponent({
	name: "todo-list",

	state: {
		newTodo: "",
		filter: "all",
		todos: [
			{ id: 1, text: "Learn Udodi", done: false },
			{ id: 2, text: "Build a component", done: true },
		],
	},

	computed: {
		filteredTodos(ctx) {
			if (ctx.filter === "active") {
				return ctx.todos.filter((todo) => !todo.done);
			}

			if (ctx.filter === "done") {
				return ctx.todos.filter((todo) => todo.done);
			}

			return ctx.todos;
		},

		remainingCount(ctx) {
			return ctx.todos.filter((todo) => !todo.done).length;
		},

		isAll(ctx) {
			return ctx.filter === "all";
		},

		isActive(ctx) {
			return ctx.filter === "active";
		},

		isDone(ctx) {
			return ctx.filter === "done";
		},
	},

	handlers: {
		addTodo(ctx) {
			const text = ctx.newTodo.trim();
			if (!text) return;

			ctx.todos = [
				...ctx.todos,
				{ id: Date.now(), text, done: false },
			];
			ctx.newTodo = "";
		},

		toggleTodo(ctx, event) {
			const id = Number(event.target.value);
			ctx.todos = ctx.todos.map((todo) =>
				todo.id === id ? { ...todo, done: !todo.done } : todo,
			);
		},

		removeTodo(ctx, event) {
			const id = Number(event.target.value);
			ctx.todos = ctx.todos.filter((todo) => todo.id !== id);
		},

		setFilter(ctx, event) {
			ctx.filter = event.target.value;
		},
	},

	template: () => `
		<section class="todos">
			<h1>Todos</h1>

			<form @on="submit.prevent:addTodo">
				<input @bind="newTodo" @ref="newTodoInput" placeholder="New todo">
				<button>Add</button>
			</form>

			<p>Remaining: <span @text="remainingCount"></span></p>

			<nav>
				<button @on="click:setFilter" value="all" @class="active:isAll">All</button>
				<button @on="click:setFilter" value="active" @class="active:isActive">Active</button>
				<button @on="click:setFilter" value="done" @class="active:isDone">Done</button>
			</nav>

			<ul>
				<li @for="todo:index filteredTodos" @key="todo.id" @class="done:todo.done">
					<span @text="index"></span>.
					<span @text="todo.text"></span>
					<button @on="click:toggleTodo" @attr="value:todo.id">Toggle</button>
					<button @on="click:removeTodo" @attr="value:todo.id">Remove</button>
				</li>
			</ul>
		</section>
	`,

	onMount(root, ctx) {
		ctx.refs.newTodoInput.focus();
	},
});

render(TodoList(), document.getElementById("app"));
```
