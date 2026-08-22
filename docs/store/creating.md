# Creating Stores

This guide covers the **global Store API** and the tools built around it: reactive reads and writes, actions, batching, selectors, subscriptions, and namespaces.

For registered feature modules with initial state and lifecycle management, see [Store Registry](./registry.md). For IndexedDB persistence, see [Persistent Stores](./persistence.md). For the conceptual model and choosing between component state, Store, and Query Pool, see [Store Overview](./overview.md).

---

## Importing the Store

```js
import {
  store,
  batch,
  createNamespace,
} from "udodi";
```

These APIs have distinct roles:

* **`store`** — the global reactive key/value store.
* **`batch()`** — stage multiple store writes before committing them.
* **`createNamespace()`** — create a prefix-scoped view over the global store.

The normal Store API is synchronous. Persistence is the separate asynchronous storage boundary.

---

## Reading and Writing State

The Store works with root keys. Each key has one current value.

### get()

```js
const theme = store.get("theme");
```

`get()` returns the current value. If the key has never been created, a reactive entry with value `undefined` is created.

When called inside an active effect, computed value, or template evaluation, `get()` tracks the key as a reactive dependency:

```js
const label = computed(() => {
  return store.get("theme") === "dark"
    ? "Dark mode"
    : "Light mode";
});
```

Use `has()` when you need to distinguish a missing key from a key whose value is `undefined`:

```js
if (store.has("theme")) {
  // The key exists.
}
```

### set()

```js
store.set("theme", "dark");
store.set("count", 0);
```

`set()` replaces the value for a key. The write is ignored when the new value is equal to the current value.

```js
store.set("count", 1);
store.set("count", 1); // unchanged
store.set("count", 2); // changed
```

Actual changes notify reactive dependents and relevant subscribers.

### update()

Use `update()` when the next value depends on the current value:

```js
store.update(
  "count",
  (count) => (count ?? 0) + 1,
);
```

Conceptually:

```js
store.set(
  "count",
  fn(store.get("count")),
);
```

It is useful for counters, toggles, and other state transitions:

```js
store.update("enabled", (value) => !value);
```

### touch()

`touch()` is for in-place mutation:

```js
const items = store.get("items");

items.push({
  id: 1,
  name: "Book",
});

store.touch("items");
```

Because the root reference did not change, `touch()` explicitly notifies dependents that the value under the key has been mutated.

It returns `true` when the key exists and is notified, and `false` when the key does not exist.

Prefer replacement when practical:

```js
store.set("items", [
  ...store.get("items"),
  {
    id: 1,
    name: "Book",
  },
]);
```

Use `touch()` when intentional in-place mutation is appropriate.

### has(), keys(), and delete()

```js
store.has("theme"); // boolean
const keys = store.keys(); // current global keys
store.delete("theme");
```

`delete()` removes the key and stops persistence associated with that key.

### clear()

```js
store.clear();
```

`clear()` removes global state and registered actions, stops persistence, and clears pending batch state. It affects the entire global Store and should therefore be used deliberately.

---

## Batching Updates

Use `batch()` to stage several Store writes before committing them:

```js
import { store, batch } from "udodi";

batch(() => {
  store.set("count", 10);
  store.set("theme", "light");
  store.delete("draft");
});
```

Writes and deletes inside a batch are staged. They are committed when the outermost batch finishes.

Nested batches are supported:

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

The inner batch does not independently commit; it only increases the batch depth.

Reads during a batch see staged values through the normal `get()` path:

```js
batch(() => {
  store.set("count", 10);
  console.log(store.get("count")); // 10

  store.update(
    "count",
    (value) => value + 1,
  );

  console.log(store.get("count")); // 11
});
```

Batching changes when staged writes are committed, not the public `set()` / `delete()` API.

It should not be documented as a guarantee that every reactive consumer executes exactly once for an entire batch. Once staged keys are committed, each changed key follows the normal reactive update path.

---

## Actions

Actions give state transitions stable names and a consistent execution context.

### defineAction()

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

store.defineAction(
  "setTheme",
  (ctx, theme) => {
    ctx.set("theme", theme);
  },
);
```

The handler signature is always:

```js
(ctx, payload)
```

Handlers may be synchronous or asynchronous:

```js
store.defineAction(
  "savePreferences",
  async (ctx, preferences) => {
    const result =
      await api.savePreferences(preferences);

    ctx.set("preferences", result);

    return result;
  },
);
```

Defining an existing action name replaces the previous registration.

### Action context

Every action receives:

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

For a global action, these operations target the global Store.

`ctx.state` is a reactive proxy:

```js
store.defineAction(
  "rename",
  (ctx, name) => {
    ctx.state.user = {
      ...ctx.state.user,
      name,
    };
  },
);
```

For module actions, the same context shape is scoped to the module namespace. See [Store Registry](./registry.md).

### dispatch()

```js
await store.dispatch("increment", 2);
await store.dispatch("setTheme", "dark");
```

`dispatch()` returns the handler's result. If the handler is asynchronous, the result is a Promise.

By default, dispatching a missing action warns and returns `undefined`.

To make a missing action an error:

```js
await store.dispatch(
  "missing",
  null,
  { throwOnMissing: true },
);
```

The equivalent strict option is:

```js
await store.dispatch(
  "missing",
  null,
  { strict: true },
);
```

### hasAction() and deleteAction()

```js
store.hasAction("increment"); // true
store.deleteAction("increment");
```

Actions and state keys are independent. Removing an action does not remove state that the action previously modified.

---

## Selectors

Selectors expose derived Store state as lazy computed values:

```js
const doubleCount = store.select(
  (state) => (state.get("count") ?? 0) * 2,
);

console.log(doubleCount());
```

Selectors are built on Udodi's `computed` primitive. They are lazy and cache their value until a tracked dependency changes.

A selector tracks the Store reads performed by its selector function:

```js
const subtotal = store.select((state) => {
  return (
    (state.get("price") ?? 0) *
    (state.get("quantity") ?? 0)
  );
});
```

Changing an unrelated Store key does not invalidate this selector.

### Selector scope

`select()` accepts an optional scope:

```js
store.select(selector, scope);
```

The scope is used when the selector is owned by a lifecycle context, such as a module. A scope contains the effect collection used to dispose owned selectors.

For global selectors, omit the scope.

Inside an action, use the action context:

```js
store.defineAction(
  "logDouble",
  (ctx) => {
    const double = ctx.select(
      (state) =>
        (state.get("count") ?? 0) * 2,
    );

    console.log(double());
  },
);
```

---

## Subscriptions

Use `subscribe()` for imperative observation of a single key:

```js
const stop = store.subscribe(
  "count",
  (next, prev) => {
    console.log(
      "count changed:", prev, "→", next,
    );
  },
);
```

The callback receives:

```js
(next, prev)
```

### Initial notification

A subscription is implemented with an effect that reads the Store key.

On its first run, when the current value is not `undefined`, the callback runs with:

```js
(next, undefined)
```

For example:

```js
store.set("theme", "dark");

const stop = store.subscribe(
  "theme",
  (next, prev) => {
    console.log(next, prev);
  },
);

// dark undefined
```

If the current value is `undefined`, there is no initial callback.

### Subsequent notifications

Later callbacks run when the key changes:

```js
store.set("count", 1);
store.set("count", 2);
```

A `touch()` notification also invokes the callback even when an object or array retains the same reference.

### Unsubscribing

The returned function disposes the subscription:

```js
stop();
```

Subscriptions are best suited to imperative boundaries such as logging, browser APIs, and integration with non-Udodi libraries. For UI derivation, prefer reactive reads in components and templates.

---

## Namespaces

`createNamespace()` creates a prefix-scoped helper over the global Store:

```js
import { createNamespace } from "udodi";

const ui = createNamespace("ui");
```

Local keys are automatically prefixed:

```js
ui.set("sidebarOpen", true);
ui.get("sidebarOpen");
```

The underlying Store key is:

```text
ui:sidebarOpen
```

A namespace is not a separate Store instance. It is a scoped API over the same global reactive state.

### Namespace API

| Namespace API | Underlying operation |
| --- | --- |
| `ui.get(key)` | `store.get("ui:key")` |
| `ui.set(key, value)` | `store.set("ui:key", value)` |
| `ui.update(key, fn)` | `store.update("ui:key", fn)` |
| `ui.touch(key)` | `store.touch("ui:key")` |
| `ui.delete(key)` | `store.delete("ui:key")` |
| `ui.has(key)` | `store.has("ui:key")` |
| `ui.subscribe(key, cb)` | `store.subscribe("ui:key", cb)` |
| `ui.dispatch(action, payload, options?)` | `store.dispatch("ui:action", payload, options?)` |
| `ui.hasAction(action)` | `store.hasAction("ui:action")` |
| `ui.select(selector, scope?)` | selector receives the namespace API |
| `ui.persist(keys, options?)` | persists the fully prefixed keys |

For example:

```js
ui.update(
  "sidebarOpen",
  (open) => !open,
);

ui.touch("items");

ui.subscribe(
  "sidebarOpen",
  (next) => {
    console.log("sidebar:", next);
  },
);
```

### Namespace selectors

A namespace selector receives the namespace API, so selectors use local keys:

```js
const sidebarLabel = ui.select(
  (state) =>
    state.get("sidebarOpen")
      ? "Close sidebar"
      : "Open sidebar",
);

console.log(sidebarLabel());
```

### Namespaced actions

Actions are registered under their fully qualified names:

```js
store.defineAction(
  "ui:toggleSidebar",
  (ctx) => {
    const key = "ui:sidebarOpen";

    ctx.update(
      key,
      (open) => !open,
    );
  },
);
```

The namespace dispatches using the local action name:

```js
await ui.dispatch("toggleSidebar");
```

The action above still receives the global action context. If you need a genuinely module-scoped action context, initial state, and lifecycle, prefer `defineStore()`.

### Namespace persistence

Namespaces can persist local keys:

```js
const controller = ui.persist(
  ["sidebarOpen"],
);
```

The persisted Store key remains:

```text
ui:sidebarOpen
```

See [Persistent Stores](./persistence.md) for persistence behavior and controller lifecycle.

---

## Putting It Together

```js
import {
  store,
  batch,
  createNamespace,
} from "udodi";

// Global preferences
store.set("theme", "system");
store.set("locale", "en");

store.defineAction(
  "setTheme",
  (ctx, theme) => {
    ctx.set("theme", theme);
  },
);

// UI namespace
const ui = createNamespace("ui");
ui.set("sidebarOpen", false);

store.defineAction(
  "ui:toggleSidebar",
  (ctx) => {
    const key = "ui:sidebarOpen";

    ctx.set(
      key,
      !ctx.get(key),
    );
  },
);

// Coordinated multi-key change
batch(() => {
  store.set("theme", "dark");
  ui.set("sidebarOpen", true);
});

// Derived state
const isDark = store.select(
  (state) => state.get("theme") === "dark",
);

console.log(isDark()); // true

// Imperative listener
const stop = store.subscribe(
  "theme",
  (theme) => {
    document.documentElement
      .dataset.theme = theme;
  },
);

// Dispose the listener when it is no longer needed
stop();
```

The roles are deliberately distinct:

```text
store
  │
  ├── state       → application-owned values
  ├── actions     → named state transitions
  ├── selectors   → derived values
  ├── subscribe   → imperative observation
  ├── batch       → coordinated writes
  └── namespace   → scoped keys/actions
```

---

## Choosing the API

| Need | Use |
| --- | --- |
| Read shared state | `store.get()` |
| Replace state | `store.set()` |
| Update from the current value | `store.update()` |
| Notify after in-place mutation | `store.touch()` |
| Check whether a key exists | `store.has()` |
| List global keys | `store.keys()` |
| Remove one key | `store.delete()` |
| Remove all global state/actions | `store.clear()` |
| Define a reusable state operation | `store.defineAction()` |
| Execute a named operation | `store.dispatch()` |
| Check/remove an action | `hasAction()` / `deleteAction()` |
| Derive reactive state | `store.select()` |
| Imperatively observe a key | `store.subscribe()` |
| Coordinate multiple writes | `batch()` |
| Scope keys/actions without a module | `createNamespace()` |
| Add initial state and lifecycle | `defineStore()` |

---

## Next Steps

* **[Store Overview](./overview.md)** — Mental model, state ownership, and choosing between component state, Store, and Query Pool.
* **[Store Registry](./registry.md)** — `defineStore()`, `useStore()`, module state, actions, and lifecycle cleanup.
* **[Persistent Stores](./persistence.md)** — IndexedDB persistence, hydration, debouncing, and persistence controllers.
* **[Store API Reference](../api/store.md)** — Exact signatures, options, and return values.
