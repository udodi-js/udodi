# Store Overview

Udodi Store is a **reactive key/value state system for application state that lives outside individual components**.

Components should keep state that belongs to a single component local to that component. The Store is for state that has a broader ownership boundary: theme and locale, session information, feature flags, shared UI state, drafts, or other client-side data that multiple parts of an application need to read and update consistently.

The Store uses Udodi's fine-grained reactivity system. A store read can therefore become a dependency of an effect, computed value, or template. A store write invalidates the reactive entry for that key, allowing only the consumers that depend on that key to react.

The Store is deliberately smaller in scope than a server-state system. It owns **application state**; [Query Pool](../query-pool/README.md) owns the lifecycle of asynchronous data.

---

## The Store Model

At its core, the Store is a single reactive key/value map:

```text
┌──────────────────────────────────────────────┐
│                  Global Store                │
│                                              │
│  "theme"            → "dark"                 │
│  "auth:user"        → { ... }                │
│  "cart:items"       → [ ... ]                │
│  "ui:sidebarOpen"   → true                   │
│                                              │
└──────────────────────────────────────────────┘
```

Every store key has one current value.

The important operations are:

- **Read** with `get()`.
- **Replace** with `set()`.
- **Derive and replace** with `update()`.
- **Notify after an in-place mutation** with `touch()`.
- **Remove** with `delete()`.

Namespaces and modules do not create independent reactive stores. They create **scoped views over the same underlying store** by prefixing keys and actions.

For example:

```text
theme
ui:sidebarOpen
auth:user
```

are all entries in the same global store. The `ui` namespace and `auth` module simply provide structured ways to work with their respective prefixes.

This architecture gives the Store one consistent reactivity model, one batching mechanism, and one persistence mechanism while still allowing applications to organize state by feature.

---

## What the Store Provides

| Capability | What it provides |
| --- | --- |
| **Reactive state** | `get()`, `set()`, `update()`, `touch()`, and `delete()` over reactive keys |
| **Actions** | Named state operations invoked as `fn(ctx, payload)` |
| **Selectors** | Lazy computed values derived from store state |
| **Subscriptions** | Imperative callbacks for changes to a specific key |
| **Batching** | Defers store notifications until a batch's outermost scope completes |
| **Namespaces** | Prefix-based isolation without registering a module |
| **Modules** | Feature-scoped state, actions, selectors, lifecycle, and a reactive `state` proxy |
| **Persistence** | Optional IndexedDB synchronization for selected keys |

The Store API itself is **synchronous**. `get()`, `set()`, `update()`, `delete()`, and related state operations do not require asynchronous access.

Persistence is the exception only at the storage boundary: IndexedDB hydration and writes are asynchronous, but they do not change the normal synchronous Store API.

---

## Choosing a State Boundary

The most important Store decision is not which method to call. It is deciding **who owns the state**.

### Component state

Keep state local when it belongs to one component:

```js
const Dialog = createComponent({
  state() {
    return {
      open: false,
    };
  },
});
```

A component-local value does not need to become application state merely because another component could theoretically access it.

### Global Store

Use the global `store` for shared application values:

```js
import { store } from "udodi";

store.set("theme", "dark");
store.set("locale", "en");
```

This is the smallest and most direct Store layer.

### Namespace

Use `createNamespace()` when state belongs to a recognizable area but does not need a registered module:

```js
const ui = createNamespace("ui");

ui.set("sidebarOpen", true);
```

The underlying key is:

```text
ui:sidebarOpen
```

### Module

Use `defineStore()` when a feature deserves a formal boundary:

```js
defineStore("cart", {
  state: {
    items: [],
    total: 0,
  },

  actions: {
    addItem(ctx, item) {
      ctx.update("items", (items) => [...items, item]);
    },
  },
});
```

Modules add registration, retrieval, lifecycle cleanup, initial state, and a module-scoped reactive `state` proxy.

---

## Global Store

The global `store` is the simplest entry point:

```js
import { store } from "udodi";

store.set("theme", "dark");

const theme = store.get("theme");
```

A global store key is not tied to a component, namespace, or module.

### Reading

```js
const theme = store.get("theme");
```

A `get()` call participates in dependency tracking when it executes inside an active reactive computation.

For example:

```js
const label = computed(() => {
  return store.get("theme") === "dark"
    ? "Dark mode"
    : "Light mode";
});
```

The computed value now depends on the `theme` key.

### Writing

```js
store.set("theme", "light");
```

`set()` replaces the value stored under the key. If the new value is equal to the current value, the write is treated as unchanged and does not notify dependents.

### Updating

Use `update()` when the next value depends on the current value:

```js
store.update("count", (count) => (count ?? 0) + 1);
```

This is preferable to manually reading and then writing when the operation is conceptually a state transition.

### Deleting

```js
store.delete("draft");
```

Deleting a key removes its value and also stops persistence associated with that key.

If the distinction between **missing** and **present with `undefined`** matters, use `has()` rather than relying on `get()`:

```js
if (store.has("draft")) {
  // The key exists.
}
```

---

## Reactivity

Store reactivity follows the same fine-grained dependency model used elsewhere in Udodi.

### `get()` tracks

A store read establishes a dependency when it happens inside an effect, computed value, or template evaluation:

```js
const total = computed(() => {
  return store.get("price") * store.get("quantity");
});
```

The computation depends on `price` and `quantity`, not on unrelated store keys.

### `set()` and `update()` notify

Replacing a value invalidates the key when the new value differs from the previous value according to `Object.is()`:

```js
store.set("count", 1);
store.set("count", 1); // unchanged
store.set("count", 2); // changed
```

### In-place mutation requires `touch()`

The Store tracks changes at the **key/root-value level**. If an object or array stored under a key is mutated in place, the Store does not infer that mutation merely because the object itself changed internally.

Call `touch()` after the mutation:

```js
const items = store.get("items");

items.push({
  id: 2,
  name: "Book",
});

store.touch("items");
```

This tells the Store to notify dependents of the key without replacing the stored object.

Use replacement when practical:

```js
store.set("items", [
  ...store.get("items"),
  {
    id: 2,
    name: "Book",
  },
]);
```

Use `touch()` when in-place mutation is intentional or more appropriate.

The same rule applies through namespaces, module APIs, and action contexts.

---

## Batching

`batch()` coordinates multiple Store writes:

```js
batch(() => {
  store.set("firstName", "Attamah");
  store.set("lastName", "Lovelace");
  store.set("role", "Mathematician");
});
```

Writes made inside a batch are staged rather than committed immediately. When the outermost batch completes, the staged changes are committed.

Batches can be nested:

```js
batch(() => {
  store.set("a", 1);

  batch(() => {
    store.set("b", 2);
    store.set("c", 3);
  });

  store.set("d", 4);
});
```

The inner batch does not independently commit the staged changes; the outermost batch remains responsible for the final commit.

Batching is primarily about **coordinating store writes and deferring their notifications**. It should not be interpreted as a promise that every reactive consumer runs exactly once regardless of how many distinct keys it depends on. The normal reactive update rules still apply when the staged keys are committed.

---

## Namespaces

A namespace provides a lightweight scope over the global store:

```js
import { createNamespace } from "udodi";

const ui = createNamespace("ui");
```

Local keys are automatically prefixed:

```js
ui.set("sidebarOpen", true);

ui.get("sidebarOpen");
```

The underlying global key is:

```text
ui:sidebarOpen
```

Namespaces also prefix action names.

```js
ui.defineAction("toggle", (ctx) => {
  ctx.update("sidebarOpen", (open) => !open);
});

await ui.dispatch("toggle");
```

The action is registered under:

```text
ui:toggle
```

### What a namespace is

A namespace is **not a new store instance**.

It is a scoped API over the existing global store. This means state created through a namespace still participates in the same global reactivity, batching, and persistence infrastructure.

A namespace is appropriate when you want organization and key isolation without the lifecycle and registration semantics of a module.

### Namespace API

A namespace exposes the core store operations in local-key form, including:

```text
get()
set()
update()
touch()
delete()
has()
keys()
subscribe()
select()
defineAction()
dispatch()
hasAction()
deleteAction()
persist()
```

The namespace adds its prefix internally.

---

## Modules

A module is a registered, feature-scoped store created with `defineStore()`.

```js
import {
  defineStore,
  useStore,
  destroyStore,
} from "udodi";

defineStore("cart", {
  state: {
    items: [],
    total: 0,
  },

  actions: {
    addItem(ctx, item) {
      ctx.update("items", (items) => [
        ...items,
        item,
      ]);
    },
  },
});
```

The module's state is stored under its namespace:

```text
cart:items
cart:total
```

Its actions are also namespaced:

```text
cart:addItem
```

Retrieve the registered module from anywhere:

```js
const cart = useStore("cart");

await cart.dispatch("addItem", {
  id: 1,
  name: "Book",
});
```

### Why use a module?

A module is useful when a feature needs more than a key prefix:

- initial state,
- named actions,
- a module-scoped reactive `state` proxy,
- selectors and subscriptions,
- persistence,
- an explicit cleanup hook,
- registration and retrieval through the registry.

Modules provide a lifecycle boundary around feature state.

### Module identity

A registered module has one registry identity per name:

```js
const first = defineStore("cart", {
  state: {
    items: [],
  },
});

const second = useStore("cart");

console.log(first === second); // true
```

The registry therefore prevents different parts of the application from accidentally creating separate module instances under the same name.

### Destroying a module

A module can be destroyed through either the registry or its own API:

```js
destroyStore("cart");
```

or:

```js
cart.destroy();
```

Destruction is the module lifecycle boundary. It removes the module's registered state and actions and performs the module's configured cleanup.

If the module owns persistence or other reactive resources, destruction also tears down those module-owned resources.

See [Store Registry](./registry.md) for the complete module lifecycle.

---

## The Action Model

Actions are named operations over Store state.

Register a global action:

```js
store.defineAction(
  "increment",
  (ctx, by = 1) => {
    ctx.update(
      "count",
      (count) => (count ?? 0) + by,
    );
  },
);
```

Execute it:

```js
const result = await store.dispatch(
  "increment",
  2,
);
```

The handler is always invoked as:

```text
fn(ctx, payload)
```

The payload is optional and application-defined.

Actions can be synchronous:

```js
store.defineAction("reset", (ctx) => {
  ctx.set("count", 0);
});
```

or asynchronous:

```js
store.defineAction("save", async (ctx, data) => {
  const result = await api.save(data);

  ctx.set("saved", result);

  return result;
});
```

`dispatch()` returns the action's result. When the handler is asynchronous, the returned value is a Promise.

### Action context

Global and module actions receive the same context shape:

```js
{
  state,
  get,
  set,
  update,
  touch,
  select,
}
```

The difference is the scope.

For a global action:

```text
ctx → global store
```

For a module action:

```text
ctx → module namespace
```

This lets action code operate against its supplied context instead of depending on the global Store directly.

---

## Selectors

Selectors are for **derived state**.

```js
const doubleCount = store.select(
  (state) => (state.get("count") ?? 0) * 2,
);
```

A selector is backed by Udodi's `computed` primitive. It is lazy and tracks the store reads performed by its selector function.

For example:

```js
const cartTotal = cart.select((state) => {
  return state.items.reduce(
    (total, item) =>
      total + item.price * item.quantity,
    0,
  );
});
```

The selector depends on the reactive state it reads. When those dependencies change, the computed value becomes stale according to normal computed semantics.

Selectors are useful for avoiding duplicated state:

```text
source state
    │
    ├── items
    ├── prices
    └── quantities
          │
          ▼
      selector
          │
          ▼
       total
```

Store the source data; derive values that can be calculated from it.

---

## Subscriptions

Subscriptions provide an imperative observation mechanism for a specific key:

```js
const stop = store.subscribe(
  "theme",
  (next, prev) => {
    console.log(
      "theme:",
      prev,
      "→",
      next,
    );
  },
);
```

The callback receives:

```text
(next, prev)
```

and the subscription returns an unsubscribe function:

```js
stop();
```

Subscriptions are useful when a state change must trigger an imperative side effect.

For reactive UI derivation, prefer a normal effect, computed value, selector, or template dependency. A subscription should not be treated as a replacement for the reactive dependency system.

---

## Persistence

Store persistence is **opt-in** and uses IndexedDB.

```js
const controller = store.persist(
  ["theme", "locale"],
  {
    debounce: 50,
  },
);

await controller.ready;
```

Persistence adds a storage layer around selected Store keys. It does not make the Store itself asynchronous:

```js
store.set("theme", "dark");

const theme = store.get("theme");
```

The state operation remains synchronous even though persistence happens asynchronously.

### Hydration

With hydration enabled, persisted values are restored from IndexedDB before the persistence controller begins subscribing to the selected keys.

This ordering matters:

```text
IndexedDB
    │
    │ hydrate
    ▼
Store state
    │
    │ subscribe
    ▼
Future changes → IndexedDB
```

It prevents the initial persistence subscription from immediately writing the in-memory initial value back over the persisted value.

When startup depends on restored state, wait for:

```js
await controller.ready;
```

### Persistence controller

The controller exposes four important lifecycle operations:

```text
ready
flush()
clear()
stop()
```

- **`ready`** — resolves when persistence initialization and hydration have completed.
- **`flush()`** — immediately writes pending persistence changes.
- **`clear()`** — removes persisted values for the controller's configured keys.
- **`stop()`** — stops future synchronization while leaving already persisted data in IndexedDB.

`clear()` and `stop()` therefore have different purposes:

```text
clear() → remove persisted data

stop()  → stop syncing, keep persisted data
```

### Debouncing

Persistence can be debounced:

```js
store.persist(["draft"], {
  debounce: 250,
});
```

This delays persistence writes until the debounce interval expires.

A debounce value of `0` uses microtask scheduling rather than a timer.

Use `flush()` when pending changes must be written immediately.

### Scoped persistence

Namespaces and modules can persist their own local keys:

```js
const settings = createNamespace("settings");

settings.persist([
  "theme",
  "locale",
]);
```

The local API uses:

```text
theme
locale
```

while the persisted Store keys are scoped by the namespace:

```text
settings:theme
settings:locale
```

This prevents different scopes from accidentally persisting the same logical key into the same Store entry.

See [Persistent Stores](./persistence.md) for the complete persistence API and controller lifecycle.

---

## Store vs Component State vs Query Pool

These systems solve different ownership problems.

| Concern | Prefer |
| --- | --- |
| UI state owned by one component | Component `state` |
| Shared client/application state | **Store** |
| Server data and request lifecycle | **Query Pool** |
| Remote-data caching and invalidation | **Query Pool** |
| Background refresh or asynchronous query work | **Query Pool** |
| Local preferences and durable client state | **Store + persistence** |

The distinction is primarily about **state ownership**.

A Store value is application-owned client state:

```text
theme
locale
sidebar state
feature flags
drafts
session/client state
```

Query Pool data is request-owned or server-owned state:

```text
API responses
query cache
loading/error state
refresh lifecycle
mutations
worker-backed asynchronous work
```

A Store action may still call an API. That does not turn the Store into a query cache:

```js
store.defineAction("renameUser", async (ctx, name) => {
  const user = await api.renameUser(name);

  ctx.set("user", user);
});
```

This can be perfectly valid when the resulting value is application state. But if the problem requires request caching, deduplication, invalidation, refresh, cancellation, or mutation lifecycle management, Query Pool is the appropriate abstraction.

---

## A Practical Decision Tree

When deciding where a value belongs, ask:

```text
Does the value belong only to one component?
        │
       yes
        ▼
 Component state

        no
        │
        ▼
Is it client/application state?
        │
       yes
        ▼
      Store
        │
        ├── Simple shared keys → global store
        │
        ├── Scoped keys/actions → namespace
        │
        └── Feature lifecycle → module

        no
        │
        ▼
Is it asynchronous/server-owned data?
        │
       yes
        ▼
   Query Pool
```

This boundary keeps the Store focused instead of turning it into a general-purpose replacement for every other state system.

---

## Store Architecture

The Store can be understood as a layered API over one reactive state space:

```text
                         ┌───────────────────┐
                         │    Global Store   │
                         │    reactive map   │
                         └─────────┬─────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
                 global       namespaces       modules
                    │              │              │
                    │         prefix keys      registry
                    │              │              │
                    └──────────────┼──────────────┘
                                   │
                          actions / selectors
                             subscriptions
                               batching
                                   │
                                   ▼
                              persistence
                                   │
                                   ▼
                               IndexedDB
```

The registry therefore organizes state; it does not replace the global reactive storage model.

Likewise, persistence is an adapter around Store state; it does not become a second source of truth. The in-memory Store remains the synchronous application-facing state layer.

---

## Core Principles

The Store is easiest to use correctly when these principles are kept in mind:

### 1. State has an owner

Use component state for component-owned concerns and Store for application-owned concerns.

### 2. Scope is organization, not a new reactivity system

Namespaces and modules isolate keys and actions by convention and lifecycle while remaining part of the same underlying Store.

### 3. Reads establish dependencies

Store reads normally inside effects, computed values, and templates. Do not manually synchronize consumers that can depend on the Store reactively.

### 4. Replace or touch

When state changes, either replace the root value with `set()` / `update()` or explicitly notify with `touch()` after an in-place mutation.

### 5. Derive instead of duplicate

Use selectors for values that can be calculated from existing Store state.

### 6. Persist deliberately

Persistence is opt-in. Persist only the state that genuinely needs to survive a page reload.

### 7. Keep server state in Query Pool

Do not turn Store actions into a home-grown query cache when the problem is fundamentally asynchronous server data.

---

## Next Steps

| Guide | What you will learn |
| --- | --- |
| **[Creating Stores](./creating.md)** | Global state operations, namespaces, actions, batching, selectors, and subscriptions |
| **[Store Registry](./registry.md)** | `defineStore()`, `useStore()`, `destroyStore()`, module state, and lifecycle |
| **[Persistent Stores](./persistence.md)** | IndexedDB persistence, hydration, debouncing, and controller lifecycle |
| **[Store API Reference](../api/store.md)** | Exact signatures, options, and return values |

For the conceptual foundation of the reactive primitives used by Store, see [Reactivity](../reactivity/README.md).

For asynchronous server state and query/mutation management, see [Query Pool](../query-pool/README.md).
