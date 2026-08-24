# Creating Stores

This guide covers the **global Store API**, including reactive state, actions, batching, selectors, and subscriptions.

For feature-level state with initial values, scoped actions, and lifecycle management, see [Store Registry](./registry.md). For IndexedDB persistence, see [Persistent Stores](./persistence.md).

---

## Importing the Store

```js
import {
  store,
  batch,
} from "udodi";
```

* **`store`** — the global reactive key/value store.
* **`batch`** — groups multiple writes into one coherent reactive update.

For registered feature modules, use `defineStore`, `useStore`, and `destroyStore` instead. See [Store Registry](./registry.md).

---

## Reading and Writing State

The global Store is a reactive key/value map. Each key holds one value and participates independently in Udodi's fine-grained reactivity system.

### get

```js
store.get("theme");
```

`get(key)`:

* Returns the current value for `key`.
* Creates a reactive entry with value `undefined` if the key has never been set.
* Tracks the key when called inside an effect, computed value, or template.
* Causes that reactive consumer to re-run when the key subsequently changes.

For example:

```js
const theme = computed(() => {
  return store.get("theme") ?? "system";
});
```

The computed value now depends specifically on the `theme` key.

### set

```js
store.set("theme", "dark");
store.set("count", 0);
```

`set(key, value)`:

* Stores `value` under `key`.
* Does nothing when `value` is `Object.is`-equal to the current value.
* Notifies reactive dependents and subscriptions when the value changes.

```js
store.set("count", 1);
store.set("count", 1); // no update
store.set("count", 2); // update
```

### update

Use `update()` when the next value depends on the current value:

```js
store.update(
  "count",
  (count) => (count ?? 0) + 1,
);
```

The updater receives the current value and its return value becomes the new value.

Conceptually:

```js
store.set(
  "count",
  fn(store.get("count")),
);
```

Using `update()` is preferable when expressing read-modify-write operations because the operation stays within the Store API.

### touch

Use `touch()` when a stored object or array is intentionally mutated in place:

```js
const items = store.get("items");

items.push({
  id: 1,
  name: "Book",
});

store.touch("items");
```

`touch(key)`:

* Notifies reactive dependents of the key.
* Notifies subscriptions.
* Returns `false` when the key does not exist.
* Returns `true` when the key exists and the notification is triggered.

Prefer replacing the value with `set()` when practical:

```js
store.set(
  "items",
  [...store.get("items"), newItem],
);
```

Use `touch()` when preserving the existing object or array reference is intentional.

### has, keys, and delete

Check whether a key exists:

```js
store.has("theme");
```

Get all registered keys:

```js
store.keys();
```

Remove a key:

```js
store.delete("theme");
```

Deleting a key removes its reactive entry and also stops persistence associated with that key.

### clear

```js
store.clear();
```

`clear()` removes all global Store state and registered global actions.

It also stops active persistence and clears pending batch state.

Use `clear()` when the entire global Store should be reset rather than when removing an individual key.

---

## Batching Updates

Use `batch()` when several state changes should be committed as one coherent update:

```js
import {
  store,
  batch,
} from "udodi";

batch(() => {
  store.set("count", 10);
  store.set("theme", "light");
  store.delete("draft");
});
```

### Batch behavior

Writes and deletes inside a batch are staged until the outermost batch completes.

```text
batch()
  │
  ├── set()
  ├── set()
  ├── delete()
  │
  ▼
outermost batch finishes
  │
  ▼
commit staged changes
  │
  ▼
reactive notification
```

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

Only the outermost batch commits the staged changes.

Reads inside a batch see the staged values through the normal `get()` path, so code does not need a separate "pending state" API.

Batching changes when updates become observable; it does not introduce a different state API.

---

## Actions

Actions provide named operations over Store state.

### defineAction

Register an action on the global Store:

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

Actions receive:

```js
(ctx, payload)
```

The payload is optional and can be any value:

```js
store.defineAction(
  "setTheme",
  (ctx, theme) => {
    ctx.set("theme", theme);
  },
);
```

Actions may also be asynchronous:

```js
store.defineAction(
  "loadUser",
  async (ctx, id) => {
    const user = await api.getUser(id);

    ctx.set("user", user);

    return user;
  },
);
```

The same action name can be registered again. The latest registration replaces the previous handler.

### Action Context

Every global action receives the same ActionContext:

```js
{
  state,   // reactive proxy over the global Store
  get,     // (key) => value
  set,     // (key, value) => void
  update,  // (key, fn) => void
  touch,   // (key) => boolean
  select,  // (selector, scope?) => computed
}
```

#### ctx.state

`ctx.state` is a reactive proxy over the global Store.

Property access maps to Store operations:

```js
store.defineAction(
  "setTheme",
  (ctx, theme) => {
    ctx.state.theme = theme;
  },
);
```

Conceptually:

```js
ctx.state.theme
// equivalent to ctx.get("theme")

ctx.state.theme = "dark"
// equivalent to ctx.set("theme", "dark")
```

Use `ctx.get()`, `ctx.set()`, and `ctx.update()` when explicit Store operations make the intent clearer.

#### Action context and modules

Global actions receive a context over the global Store.

Module actions use the same ActionContext shape, but their context is scoped to the module's state. This means module code can work with local keys without knowing the module's internal namespace.

For example, see [Store Registry](./registry.md).

### dispatch

Run a registered action with `dispatch()`:

```js
await store.dispatch(
  "increment",
  2,
);
```

For an asynchronous action:

```js
const user = await store.dispatch(
  "loadUser",
  userId,
);
```

`dispatch()` returns the action handler's result directly.

If the handler is asynchronous, the returned value is a Promise.

### Missing actions

By default, dispatching an action that does not exist warns and returns `undefined`:

```js
store.dispatch("doesNotExist");
// warns
// returns undefined
```

Use `throwOnMissing` when a missing action should be treated as an error:

```js
store.dispatch(
  "doesNotExist",
  null,
  {
    throwOnMissing: true,
  },
);
```

`strict: true` can be used as an equivalent strict option:

```js
store.dispatch(
  "doesNotExist",
  null,
  {
    strict: true,
  },
);
```

### hasAction and deleteAction

Check whether an action is registered:

```js
store.hasAction("increment");
```

Remove an action:

```js
store.deleteAction("increment");
```

Deleting an action does not modify Store state. It only removes the named action handler.

---

## Selectors

Selectors derive values from Store state.

```js
const doubleCount = store.select(
  (state) => {
    return (state.get("count") ?? 0) * 2;
  },
);
```

Read the derived value by invoking the returned computed:

```js
doubleCount();
```

Selectors are built on Udodi's `computed` primitive.

They are:

* **lazy** — computation begins when the selector is read;
* **reactive** — dependencies are tracked through Store reads;
* **cached** — the computed value is reused until a tracked dependency changes.

For example:

```js
store.set("count", 10);

doubleCount();
// 20

store.set("count", 20);

doubleCount();
// 40
```

### Selectors inside actions

The action context exposes the same selector mechanism:

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

The optional second argument to `select()` is a scope used when the selector needs lifecycle cleanup, particularly in module contexts.

Global selectors generally do not need to provide a scope explicitly.

---

## Subscriptions

Use `subscribe()` when imperative code needs to react to a Store key changing:

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

The returned function removes the subscription:

```js
stop();
```

### Subscription behavior

Subscriptions are implemented using Udodi's reactive effect system.

On the initial run:

* if the value is not `undefined`, the callback runs with `(next, undefined)`;
* if the value is `undefined`, no initial callback is emitted.

Subsequent changes invoke:

```js
cb(next, prev);
```

A subscription can also run when `touch()` forces a notification even though the stored reference remains the same.

For example:

```js
const items = store.get("items");

const stop = store.subscribe(
  "items",
  (next, prev) => {
    // next and prev may be
    // the same object reference.
  },
);

items.push(newItem);

store.touch("items");
```

Use subscriptions primarily for imperative integration:

```js
store.subscribe(
  "theme",
  (theme) => {
    document.documentElement
      .dataset.theme = theme;
  },
);
```

For UI rendering, prefer normal reactive reads in components and templates.

---

## Organizing State

The global Store is appropriate for simple shared state:

```js
store.set("theme", "system");
store.set("locale", "en");
```

When state belongs to a feature and needs a formal boundary, use a Store module:

```js
import {
  defineStore,
  useStore,
} from "udodi";

defineStore("cart", {
  state: {
    items: [],
  },

  actions: {
    addItem(ctx, item) {
      ctx.update(
        "items",
        (items) => [
          ...items,
          item,
        ],
      );
    },
  },
});

const cart = useStore("cart");

cart.dispatch(
  "addItem",
  {
    id: 1,
    name: "Book",
  },
);
```

Modules provide scoped state and actions without requiring application code to manually manage key prefixes.

Internally, module state is namespaced, but that namespace is an implementation detail. Application code should work with the module's local keys:

```js
cart.get("items");
cart.set("items", nextItems);
cart.update("items", fn);
cart.dispatch("addItem", item);
```

See [Store Registry](./registry.md) for the complete module API.

---

## Putting It Together

The following example combines global state, actions, batching, selectors, and subscriptions:

```js
import {
  store,
  batch,
} from "udodi";

// Shared application state
store.set("theme", "system");
store.set("count", 0);

// Named operation
store.defineAction(
  "setTheme",
  (ctx, theme) => {
    ctx.set("theme", theme);
  },
);

store.defineAction(
  "increment",
  (ctx, by = 1) => {
    ctx.update(
      "count",
      (count) => (count ?? 0) + by,
    );
  },
);

// Coherent multi-key update
batch(() => {
  store.dispatch(
    "setTheme",
    "dark",
  );

  store.dispatch(
    "increment",
    1,
  );
});

// Derived state
const isDark = store.select(
  (state) =>
    state.get("theme") === "dark",
);

console.log(isDark());
// true

// Imperative integration
const stop = store.subscribe(
  "theme",
  (theme) => {
    document.documentElement
      .dataset.theme = theme;
  },
);
```

The global Store remains deliberately small:

```text
Global Store
├── reactive state
├── actions
├── batching
├── selectors
└── subscriptions
```

For structured feature state, move to Store modules rather than manually creating namespaces.

---

## Persistence

Persistence is intentionally documented separately because it introduces an asynchronous storage boundary while the Store itself remains synchronous.

```js
const controller = store.persist(
  ["theme", "locale"],
  {
    debounce: 50,
  },
);

await controller.ready;
```

See [Persistent Stores](./persistence.md) for:

* IndexedDB persistence;
* hydration;
* debounced writes;
* `ready`;
* `flush()`;
* `clear()`;
* `stop()`;
* persistence errors;
* module persistence.

---

## Next Steps

* **[Store Overview](./overview.md)** — mental model, reactivity, state organization, and Store vs Component State vs Query Pool.
* **[Store Registry](./registry.md)** — `defineStore`, `useStore`, module state, scoped actions, and lifecycle.
* **[Persistent Stores](./persistence.md)** — IndexedDB persistence, hydration, and persistence controllers.
* **[Store API Reference](../api/store.md)** — precise signatures, options, and return values.
