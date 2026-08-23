# Udodi Store

Udodi Store provides reactive application state outside individual components.

A store is useful when state must be shared by multiple components or managed independently of any single component instance. Store values participate in Udodi's fine-grained reactivity, so reads performed through the store can become dependencies of effects, computed values, and other reactive consumers.

The Store package provides three complementary layers:

* **Global store** — A flat reactive key/value store with updates, actions, selectors, subscriptions, batching, and optional persistence.
* **Modules** — Define feature modules with `defineStore()`, retrieve them with `useStore()`, and destroy them with `destroyStore()`.
* **Persistence** — Opt-in IndexedDB synchronization for selected keys, including hydration and explicit persistence control.

The Store is intended for **application state**. For server state fetching, caching, background refresh, mutations, and worker-backed asynchronous work, use [Query Pool](../query-pool/README.md).

---

## Guides

| Guide | Description |
| --- | --- |
| **[Store Overview](./overview.md)** | Understand the store model, reactivity, modules, and when to use each layer. |
| **[Creating Stores](./creating.md)** | Work with the global `store`, actions, selectors, subscriptions, and batching. |
| **[Store Registry](./registry.md)** | Define reusable modules with `defineStore()`, retrieve them with `useStore()`, and destroy them with `destroyStore()`. |
| **[Persistent Stores](./persistence.md)** | Persist selected store keys to IndexedDB, hydrate them on startup, and control synchronization. |

**Start here → [Store Overview](./overview.md)**

---

## Quick Example

The following example combines the global store, a feature module, reactive reads, actions, selectors, subscriptions, and persistence:

```js
import {
  store,
  batch,
  defineStore,
  useStore,
  destroyStore,
} from "udodi";

// Global application state
store.set("theme", "dark");
store.set("count", 0);

// Named global action
store.defineAction("increment", (ctx, by = 1) => {
  ctx.update("count", (value) => value + by);
});

await store.dispatch("increment", 2);

console.log(store.get("count")); // 2

// Group several store writes
batch(() => {
  store.set("count", 10);
  store.set("theme", "light");
});

// Observe a key
const stop = store.subscribe("count", (next, prev) => {
  console.log("count:", prev, "→", next);
});

// Persist selected keys
const persistence = store.persist(["theme", "count"], {
  debounce: 100,
});

await persistence.ready;

// Feature module
const counter = defineStore("counter", {
  state: {
    value: 0,
    label: "Counter",
  },

  actions: {
    increment(ctx, by = 1) {
      ctx.update("value", (value) => value + by);
    },

    reset(ctx) {
      ctx.set("value", 0);
    },
  },
});

// The registry returns the same module instance
const same = useStore("counter");

await same.dispatch("increment", 1);

console.log(same.get("value")); // 1
console.log(same.state.value);  // 1

// Remove the module when it is no longer needed
destroyStore("counter");

// Remove the subscription when it is no longer needed
stop();
```

This illustrates the main separation in the Store system:

1. `store` provides a shared application-wide key/value space.
2. `defineAction()` and `dispatch()` keep reusable state transitions named and explicit.
3. `batch()` groups store writes into one store-level transaction.
4. `subscribe()` provides an imperative observation mechanism and returns a cleanup function.
5. `persist()` adds IndexedDB synchronization without turning normal store reads and writes into asynchronous operations.
6. `defineStore()` creates a feature-scoped module.
7. `useStore()` retrieves an already registered module.
8. `destroyStore()` removes the module and its owned resources.

---

## Global Store

The global `store` is a shared reactive key/value map.

```js
store.set("user", {
  id: 42,
  name: "Attamah",
});

const user = store.get("user");
```

The important distinction is between **reading state** and **changing state**:

* `get()` reads a value and participates in reactive dependency tracking.
* `set()` replaces a value.
* `update()` derives a replacement from the current value.
* `touch()` explicitly notifies reactivity after an in-place mutation.
* `delete()` removes a key.

### Core operations

| Method | Purpose |
| --- | --- |
| `store.get(key)` | Read a value. The read is reactive when performed inside a reactive computation. |
| `store.set(key, value)` | Replace a value. Writes are skipped when `Object.is(previous, value)` is true. |
| `store.update(key, fn)` | Compute and set a value from the current value. |
| `store.touch(key)` | Notify reactivity after mutating a stored value in place. |
| `store.delete(key)` | Remove a key and stop persistence associated with that key. |
| `store.has(key)` | Test whether a key currently exists. |
| `store.keys()` | Return the current store keys. |
| `store.subscribe(key, callback)` | React to changes for a key and return an unsubscribe function. |
| `store.select(selector, scope?)` | Create a lazy computed selector over store state. |
| `store.defineAction(name, fn)` | Register a named action. |
| `store.dispatch(name, payload?, options?)` | Execute a registered action. |
| `store.hasAction(name)` | Test whether an action is registered. |
| `store.deleteAction(name)` | Remove a registered action. |
| `store.persist(keys, options?)` | Synchronize selected keys with IndexedDB. |
| `store.clear()` | Clear the global store and registered actions. |

A call to `get()` for a previously unseen key creates an internal reactive entry with an `undefined` value. Use `has()` when you need to distinguish an absent key from a key whose value is `undefined`.

---

## Reactivity

Store values are backed by Udodi's reactive system.

A read performed through `store.get()` establishes a dependency when it occurs inside an effect or computed computation:

```js
const total = computed(() => {
  return store.get("price") * store.get("quantity");
});
```

Changing either dependency causes the computed value to become stale and update according to Udodi's normal computed semantics.

This also applies to selectors:

```js
const total = store.select(
  (state) => state.get("price") * state.get("quantity")
);
```

A selector is lazy: it creates a computed value rather than immediately evaluating and storing a snapshot.

### Replacing values

Prefer replacement for ordinary state updates:

```js
store.set("items", [...store.get("items"), newItem]);
```

### Mutating values in place

If a stored object or array is mutated without replacing the root value, call `touch()`:

```js
const items = store.get("items");

items.push(newItem);

store.touch("items");
```

`touch()` is specifically for telling the reactive system that the value stored under a key was changed in place. It does not replace the value.

The same operation is available through an action context and module APIs.

---

## Actions

Actions provide named operations over store state.

A global action is registered with `defineAction()`:

```js
store.defineAction("increment", (ctx, by = 1) => {
  ctx.update("count", (value) => value + by);
});
```

It is executed with `dispatch()`:

```js
await store.dispatch("increment", 5);
```

Action handlers always receive:

```text
fn(ctx, payload)
```

The payload is application-defined. It can be a primitive, object, array, or any other value appropriate for the action.

### Action context

Global and module actions use the same context shape:

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

For a global action, `state` is a proxy over the global store:

```js
store.defineAction("renameUser", (ctx, name) => {
  ctx.state.user = {
    ...ctx.state.user,
    name,
  };
});
```

For a module action, the same properties are scoped to that module's namespace.

This makes action implementations portable between global and module stores: the handler works with its supplied context rather than reaching into another store directly.

### Missing actions

Dispatching an unknown action normally warns and returns `undefined`.

When missing actions should be treated as errors, use either `throwOnMissing` or `strict`:

```js
await store.dispatch("missing", undefined, {
  throwOnMissing: true,
});
```

---

## Selectors

Selectors provide derived store state without introducing another manually synchronized store key.

```js
const subtotal = store.select(
  (state) => state.get("price") * state.get("quantity")
);
```

Selectors are computed values, so they track the store reads performed by the selector.

For modules, the selector receives the module's reactive `state` proxy and module API:

```js
const cartTotal = cart.select((state) => {
  return state.items.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );
});
```

Use selectors for **derived state**. Keep source state in the store and avoid duplicating values that can be calculated from existing state.

---

## Subscriptions

`subscribe()` provides an imperative way to observe one store key:

```js
const stop = store.subscribe("theme", (next, prev) => {
  console.log("theme:", prev, "→", next);
});
```

The callback receives:

```text
(next, prev)
```

The subscription returns a cleanup function:

```js
stop();
```

Subscriptions are useful when code needs an imperative side effect rather than a reactive value. For UI derivation and computed state, prefer Udodi's normal reactive primitives or selectors.

A subscription does not turn the store into an event emitter. It is implemented through Udodi's reactive effect system and follows the store key's reactive lifecycle.

---

## Store Modules

For feature-level state, use the registry:

```js
defineStore(name, definition)
```

A module combines:

* namespaced state,
* namespaced actions,
* a reactive `state` proxy,
* selectors,
* subscriptions,
* persistence,
* lifecycle cleanup.

Example:

```js
const auth = defineStore("auth", {
  state: {
    user: null,
    token: null,
  },

  actions: {
    login(ctx, user) {
      ctx.set("user", user);
    },

    logout(ctx) {
      ctx.set("user", null);
      ctx.set("token", null);
    },
  },

  cleanup(moduleApi) {
    // Optional module teardown.
  },
});
```

The module's state is stored under the module namespace:

```text
auth:user
auth:token
```

Its actions are registered under the same namespace:

```text
auth:login
auth:logout
```

### Module state proxy

The returned module API exposes a reactive `state` proxy:

```js
auth.state.user
auth.state.token
```

Assignment through the proxy writes through the module API:

```js
auth.state.user = nextUser;
```

Deletion also removes the namespaced key:

```js
delete auth.state.user;
```

The proxy is scoped to the module; it does not expose unrelated global keys.

### Module access

Once a module has been registered, `useStore()` returns the same module instance:

```js
const authAgain = useStore("auth");

console.log(authAgain === auth); // true
```

Calling `defineStore()` again with an already registered name also returns the existing module rather than creating a second registration.

### Module destruction

Destroy a module with:

```js
destroyStore("auth");
```

or:

```js
auth.destroy();
```

Destruction:

1. runs the optional `cleanup()` hook;
2. removes module-owned selector effects;
3. removes module state;
4. stops persistence associated with that state;
5. removes module actions;
6. unregisters the module.

Module destruction is therefore the lifecycle boundary for feature-level store resources.

---

## Batching

`batch()` lets several store writes be staged before they are committed:

```js
batch(() => {
  store.set("firstName", "Attamah");
  store.set("lastName", "Lovelace");
  store.set("role", "Mathematician");
});
```

Batches can be nested. Only the outermost batch commits the staged changes.

Inside a batch, subsequent store reads see the currently staged value:

```js
batch(() => {
  store.set("count", 10);

  console.log(store.get("count")); // 10

  store.update("count", (value) => value + 1);

  console.log(store.get("count")); // 11
});
```

Batching is primarily a **store write-coordination mechanism**. It should not be described as an automatic guarantee that every reactive consumer will execute exactly once for a multi-key batch; each committed key still goes through the normal reactive store update path.

---

## Persistence

Persistence is opt-in and uses IndexedDB.

```js
const persistence = store.persist(["theme", "draft"], {
  debounce: 100,
});

await persistence.ready;
```

Persistence does not make `get()`, `set()`, `update()`, or other normal store operations asynchronous. IndexedDB synchronization happens alongside the synchronous store.

By default:

* database name: `udodi-store`
* object store name: `state`
* hydration: enabled
* `undefined`: removes the persisted key
* debounce: `0`, meaning writes are scheduled through a microtask

### Hydration

When hydration is enabled, the persistence controller:

1. opens the IndexedDB database;
2. restores configured keys;
3. subscribes to those keys **after hydration**.

This ordering prevents restored values from being immediately overwritten by the persistence subscription.

Wait for `ready` when application startup depends on restored state:

```js
const persistence = store.persist(["preferences"]);

await persistence.ready;

const preferences = store.get("preferences");
```

`ready` resolves to `true` when the persistence setup and hydration complete successfully, and `false` when persistence cannot be activated or initialization fails.

### Persistence controller

The controller exposes:

| Property / Method | Purpose |
| --- | --- |
| `controller.keys` | The local keys managed by the controller. |
| `controller.ready` | Promise that resolves after IndexedDB setup and optional hydration. |
| `controller.flush()` | Immediately writes pending persistence changes. |
| `controller.clear()` | Removes persisted values for the configured keys. |
| `controller.stop()` | Stops future synchronization while retaining data already stored in IndexedDB. |

`clear()` removes persisted data but **does not disable the controller**. Subsequent store changes can be persisted again.

`stop()` is different: it stops the controller's subscriptions and scheduled synchronization. Data already stored in IndexedDB remains untouched.

### Debouncing

With:

```js
store.persist("draft", {
  debounce: 250,
});
```

changes are delayed until the debounce period expires. A value of `0` uses a microtask rather than creating a timer.

`flush()` can be used when an application needs pending persistence writes committed immediately.

### IndexedDB availability

If IndexedDB is unavailable, persistence becomes an inactive controller rather than changing the synchronous store API. The controller's `ready` resolves to `false`.

### Persistence and modules

Modules can persist local keys while keeping their storage keys isolated:

```js
const settings = defineStore("settings", {
  state: {
    theme: "system",
    language: "en",
  },
});

const persistence = settings.persist([
  "theme",
  "language",
]);
```

The application works with local keys through the module API, while persistence uses the fully qualified keys:

```text
settings:theme
settings:language
```

This prevents different modules from accidentally sharing the same IndexedDB key.

---

## Choosing a Store Layer

Udodi provides several ways to organize shared state:

| Use | Recommended API |
| --- | --- |
| A few simple application-wide values | `store` |
| A feature with state, actions, selectors, and lifecycle | `defineStore()` / `useStore()` |
| State that must survive reloads | `persist()` |
| Remote/server data, caching, refresh, or mutations | [Query Pool](../query-pool/README.md) |

A useful rule is:

> **Store local application state; Query Pool manages asynchronous server state.**

For example, a UI theme belongs naturally in Store:

```js
store.set("theme", "dark");
```

A cached API response with loading, error, refresh, cancellation, or mutation semantics belongs in Query Pool rather than being recreated as a collection of store actions.

---

## Store Architecture

The Store package is deliberately layered.

```text
                         ┌───────────────────┐
                         │    Global Store   │
                         │    reactive map   │
                         └─────────┬─────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
                 global                       modules
                    │                             │
                    │                       registry / scope
                    │                             │
                    └──────────────┬──────────────┘
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

The registry does not create an independent storage engine. Modules are built on the global store through an internal namespace. This keeps global state and modules consistent while allowing different levels of structure and lifecycle management.

---

## Global Store vs Module Store

The distinction is primarily about **organization and lifecycle**, not different reactivity systems.

| Capability | Global `store` | `defineStore()` module |
| --- | --- | --- |
| Reactive state | Yes | Yes |
| Key/value access | Yes | Scoped |
| Actions | Yes | Prefixed |
| Selectors | Yes | Module-scoped |
| Subscriptions | Yes | Yes |
| Persistence | Yes | Yes |
| Reactive `state` proxy | Action context | Yes |
| Initial state definition | Manual | `state` definition |
| Cleanup hook | No | `cleanup()` |
| Explicit lifecycle | Application-wide | `destroy()` / `destroyStore()` |

Use the smallest layer that gives the feature the structure it needs.

---

## Store and Query Pool

Store and Query Pool solve different state-management problems.

**Store** is for state owned by the application:

```text
theme
sidebar state
authentication/session state
feature flags
drafts
local preferences
UI state
```

**Query Pool** is for asynchronous data:

```text
API queries
server responses
request caching
background refresh
mutations
worker-backed computation
```

A store action can call asynchronous application code, but that does not make the Store a server-state cache. If the problem involves request lifecycle, caching, deduplication, refresh, cancellation, or mutation state, Query Pool is the more appropriate abstraction.

---

## Related Documentation

* **[Store Overview](./overview.md)** — The conceptual model of global state, modules, and reactivity.
* **[Creating Stores](./creating.md)** — Detailed store usage and state operations.
* **[Store Registry](./registry.md)** — Module registration, access, actions, and lifecycle.
* **[Persistent Stores](./persistence.md)** — IndexedDB persistence, hydration, and controllers.
* **[Reactivity](../reactivity/README.md)** — Signals, effects, computed values, and `touch()`.
* **[Query Pool](../query-pool/README.md)** — Reactive asynchronous data, caching, and mutations.
* **[Store API Reference](../api/store.md)** — Authoritative signatures, options, and return values.

The API reference is the authoritative source for exact signatures and option details. The guides explain how the pieces fit together and when to use each API.
