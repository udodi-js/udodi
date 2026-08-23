# Store Registry

The Store registry provides **named store modules** for feature-level application state.

A module builds on the global Store and namespace system by combining:

* **initial state** for a feature;
* **module-scoped actions**;
* **reactive selectors**;
* a reactive **`state` proxy**;
* optional **IndexedDB persistence**;
* explicit **lifecycle cleanup**.

A module does not create a separate reactive store. Its state and actions remain backed by Udodi's global Store, while the registry gives them a stable namespace, a scoped API, and a lifecycle.

For the global Store API, batching, and lightweight namespaces, see [Creating Stores](./creating.md). For persistence details, see [Persistent Stores](./persistence.md).

---

## Importing the Registry

```js
import {
  defineStore,
  useStore,
  destroyStore,
} from "udodi";
```

| API | Purpose |
| --- | --- |
| `defineStore(name, def)` | Register a named module and return its module API. |
| `useStore(name)` | Retrieve a registered module. |
| `destroyStore(name)` | Destroy a registered module and release its resources. |

The registry is intentionally small: `defineStore()` establishes the module, `useStore()` accesses it, and `destroyStore()` removes it.

---

## Defining a Module

A module is defined with a name and a definition object:

```js
const auth = defineStore("auth", {
  state: {
    user: null,
    token: null,
  },

  actions: {
    async login(ctx, { email, password }) {
      const data = await api.login(email, password);

      ctx.set("user", data.user);
      ctx.set("token", data.token);
    },

    logout(ctx) {
      ctx.set("user", null);
      ctx.set("token", null);
    },
  },

  cleanup(moduleApi) {
    // Optional teardown.
  },
});
```

### Module definition

The definition has three optional properties:

```js
{
  state?,
  actions?,
  cleanup?,
}
```

#### state

`state` contains the module's initial key/value pairs.

```js
state: {
  items: [],
  total: 0,
}
```

These values are written into the module namespace when the module is first created.

#### actions

`actions` maps local action names to handlers:

```js
actions: {
  addItem(ctx, item) {
    ctx.update("items", (items) => [
      ...items,
      item,
    ]);
  },
}
```

Actions are registered globally under the module's namespace:

```text
cart:addItem
```

but their action context is module-scoped, so handlers work with local keys such as `items`.

#### cleanup

`cleanup` is an optional teardown hook:

```js
cleanup(moduleApi) {
  // Release resources owned by the feature.
}
```

It runs when the module is destroyed. Errors from the cleanup hook are ignored so that module destruction can continue releasing the rest of its resources.

---

## Registration Is Idempotent

A module name identifies one registered module.

If `defineStore()` is called again with a name that is already registered, the existing module API is returned:

```js
const first = defineStore("cart", {
  state: {
    items: [],
  },
});

const second = defineStore("cart", {
  state: {
    items: [],
  },
});

first === second; // true
```

The second definition does not reinitialize the state or register a second set of actions.

This makes module registration safe to centralize in an application bootstrap or feature store file:

```js
// stores/cart.js
export const cart = defineStore("cart", {
  // ...
});
```

Other parts of the application can then retrieve the same module with `useStore("cart")`.

---

## How Modules Map to the Global Store

A module named `auth` owns the `auth:` namespace:

| Module concept | Global Store entry |
| --- | --- |
| `user` | `auth:user` |
| `token` | `auth:token` |
| `login` | `auth:login` |
| `logout` | `auth:logout` |

Conceptually:

```text
defineStore("auth", ...)
        │
        ├── state
        │     ├── user  → auth:user
        │     └── token → auth:token
        │
        └── actions
              ├── login  → auth:login
              └── logout → auth:logout
```

Under the hood, modules use the same namespace mechanism exposed by `createNamespace()`.

There is therefore:

* one global reactive map;
* one Store reactivity system;
* one batching mechanism;
* one persistence path.

The registry adds organization and lifecycle, not another reactive runtime.

---

## Module API

`defineStore()` returns a module API. `useStore()` retrieves that same API:

| Member | Purpose |
| --- | --- |
| `get(key)` | Read a local state key. |
| `set(key, value)` | Write a local key. |
| `update(key, fn)` | Update a local key from its current value. |
| `touch(key)` | Notify after in-place mutation. |
| `delete(key)` | Remove a local key. |
| `has(key)` | Check whether a local key exists. |
| `subscribe(key, cb)` | Subscribe to a local key; returns unsubscribe. |
| `dispatch(action, payload?, options?)` | Dispatch a module action. |
| `hasAction(action)` | Check whether a local action exists. |
| `select(selector, scope?)` | Create a module-scoped selector. |
| `persist(keys, options?)` | Persist local keys with the module prefix. |
| `state` | Reactive proxy over module state. |
| `destroy()` | Destroy this module. |

Keys and action names are local. Do not pass fully qualified names to the module API:

```js
cart.get("items");        // correct
cart.dispatch("addItem"); // correct
```

not:

```js
cart.get("cart:items");
cart.dispatch("cart:addItem");
```

The module API applies the namespace automatically.

---

## Using a Module

A typical application registers a module once and retrieves it wherever the feature needs it:

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
        (items) => [...items, item],
      );
    },

    clear(ctx) {
      ctx.set("items", []);
    },
  },
});
```

Elsewhere:

```js
const cart = useStore("cart");

if (!cart) {
  // The module has not been registered,
  // or it has already been destroyed.
}

await cart.dispatch(
  "addItem",
  {
    id: 1,
    name: "Book",
  },
);

console.log(cart.get("items"));
console.log(cart.state.items);
```

`useStore(name)` returns `undefined` when the module is not registered.

This makes the registry suitable for feature code that is loaded or unloaded independently of the application shell.

---

## The `state` Proxy

Every module exposes a reactive `state` proxy:

```js
const cart = useStore("cart");

cart.state.items;          // read
cart.state.items = [];     // write
delete cart.state.items;   // delete
"items" in cart.state;     // existence
Object.keys(cart.state);   // known state keys
```

Property operations map to the module's local Store operations:

```text
state.foo
    ↓
module.get("foo")

state.foo = value
    ↓
module.set("foo", value)

delete state.foo
    ↓
module.delete("foo")

"foo" in state
    ↓
module.has("foo")
```

Symbols are ignored.

### Tracking dynamically added keys

The module tracks keys written through `set()`, `update()`, or assignment through the proxy.

For example:

```js
const cart = useStore("cart");

cart.set("discount", 10);

// The new key is now part of the module's
// tracked state and will be removed on destroy.
```

This tracking matters because `destroy()` needs to know which global Store keys belong to the module.

### Using `state` inside actions

The action context exposes the same module proxy:

```js
defineStore("profile", {
  state: {
    user: null,
  },

  actions: {
    rename(ctx, name) {
      ctx.state.user = {
        ...ctx.state.user,
        name,
      };
    },
  },
});
```

`ctx.state` and the module's `state` refer to the same module-scoped reactive state surface.

For actions, `ctx.state` is often the most convenient way to work with several related properties.

---

## Module Actions

Module actions use the same `(ctx, payload)` convention as global actions, but their context is scoped to the module:

```js
{
  state,   // module state proxy
  get,     // local read
  set,     // local write
  update,  // local update
  touch,   // local notification
  select,  // module selector
}
```

For example:

```js
defineStore("auth", {
  state: {
    user: null,
    token: null,
  },

  actions: {
    logout(ctx) {
      ctx.set("user", null);
      ctx.set("token", null);
    },
  },
});
```

The action uses local keys:

```js
ctx.set("user", null);
```

rather than:

```js
ctx.set("auth:user", null);
```

The module supplies the prefix.

### Dispatching module actions

From the module API:

```js
const auth = useStore("auth");

await auth.dispatch("logout");
```

The corresponding global action is:

```js
await store.dispatch("auth:logout");
```

The two dispatch paths target the same registered action.

Module action handlers may be synchronous or asynchronous. `dispatch()` returns the handler's result, or its Promise when the handler is asynchronous.

Missing-action behavior is the same as the global Store:

* warn and return `undefined` by default;
* use `{ throwOnMissing: true }` or `{ strict: true }` to throw.

---

## Selectors

Module selectors derive values from module state:

```js
const cart = useStore("cart");

const itemCount = cart.select(
  (state) => state.items.length,
);

console.log(itemCount());
```

A module selector receives the module's state proxy as its first argument and the module API as its second argument:

```js
const summary = cart.select(
  (state, api) => ({
    count: state.items.length,
    hasItems: state.items.length > 0,
    store: api,
  }),
);
```

Selectors are lazy computed values. They track the reactive state they read and recompute when those dependencies change.

### Selector ownership

By default, selectors created through a module are owned by the module's selector scope:

```js
const itemCount = cart.select(
  (state) => state.items.length,
);
```

That selector is disposed automatically when the module is destroyed.

An explicit scope can be supplied when selector ownership needs to be managed elsewhere:

```js
const itemCount = cart.select(
  (state) => state.items.length,
  customScope,
);
```

Inside a module action, use `ctx.select()`:

```js
actions: {
  logCount(ctx) {
    const count = ctx.select(
      (state) => state.items.length,
    );

    console.log(count());
  },
}
```

---

## Persistence

Modules inherit the Store's namespace-aware persistence API.

Persist local module keys:

```js
const auth = useStore("auth");

const controller = auth.persist(
  ["token", "user"],
  {
    debounce: 50,
  },
);

await controller.ready;
```

The module translates the local keys into fully qualified Store keys:

```text
token → auth:token
user  → auth:user
```

Persistence therefore remains isolated between modules without requiring application code to manage prefixes manually.

See [Persistent Stores](./persistence.md) for:

* hydration;
* IndexedDB configuration;
* debouncing;
* `ready`;
* `flush()`;
* `clear()`;
* `stop()`;
* persistence error handling.

Deleting a module key follows the normal Store deletion path and stops persistence for that key.

Destroying the module removes its tracked state and therefore releases persistence associated with those keys.

---

## Destroying a Module

Destroy a module through the registry:

```js
import {
  destroyStore,
  useStore,
} from "udodi";

destroyStore("auth");
```

The module API exposes the equivalent operation:

```js
useStore("auth")?.destroy();
```

### Destruction lifecycle

Destroying a module releases the resources associated with it in this order:

1. Call the definition's `cleanup(moduleApi)` hook, if provided.
2. Call `moduleApi.__cleanup()` if one has been attached.
3. Dispose module-owned selectors in the default selector scope.
4. Delete all tracked module state keys. This also stops persistence for those keys.
5. Remove the module's registered actions.
6. Unregister the module from the registry.

Cleanup errors are ignored so that one cleanup failure does not prevent the remaining teardown steps.

After destruction:

```js
useStore("auth"); // undefined
```

The same name can then be registered again:

```js
defineStore("auth", {
  state: {
    user: null,
  },
});
```

The new registration is a fresh module.

---

## Full Example

The following module owns cart state, exposes feature actions, derives a value with a selector, and cleans itself up when the feature is unloaded:

```js
import {
  defineStore,
  useStore,
  destroyStore,
} from "udodi";

defineStore("cart", {
  state: {
    items: [],
    coupon: null,
  },

  actions: {
    addItem(ctx, item) {
      ctx.update(
        "items",
        (items) => [...items, item],
      );
    },

    removeItem(ctx, id) {
      ctx.update(
        "items",
        (items) =>
          items.filter(
            (item) => item.id !== id,
          ),
      );
    },

    applyCoupon(ctx, code) {
      ctx.set("coupon", code);
    },

    clear(ctx) {
      ctx.set("items", []);
      ctx.set("coupon", null);
    },
  },

  cleanup() {
    console.log("cart module destroyed");
  },
});

const cart = useStore("cart");

await cart.dispatch(
  "addItem",
  {
    id: 1,
    name: "Book",
    price: 12,
  },
);

await cart.dispatch(
  "applyCoupon",
  "SAVE10",
);

const totalItems = cart.select(
  (state) => state.items.length,
);

console.log(totalItems());    // 1
console.log(cart.state.coupon); // "SAVE10"

// When the feature is unloaded:
destroyStore("cart");
```

The important lifecycle is:

```text
defineStore("cart", ...)
        │
        ▼
   registered module
        │
        ├── state
        ├── actions
        ├── selectors
        ├── subscriptions/persistence
        └── reactive state proxy
        │
        ▼
useStore("cart")
        │
        ▼
feature uses module
        │
        ▼
destroyStore("cart")
        │
        ├── cleanup
        ├── dispose selectors
        ├── remove state
        ├── remove actions
        └── unregister
```

---

## Modules vs Namespaces vs Global Store

| Approach | Use when |
| --- | --- |
| **Global store** | You have a small number of shared keys with no feature boundary. |
| **`createNamespace()`** | You want prefix isolation and scoped operations without module registration or lifecycle. |
| **`defineStore()`** | A feature needs initial state, scoped actions, selectors, persistence, and explicit cleanup. |

A useful rule is:

```text
Small cross-cutting value
        ↓
      store

Small scoped group of values/actions
        ↓
  createNamespace()

Feature with ownership + lifecycle
        ↓
   defineStore()
```

For example:

* `theme` or `locale` may be appropriate global state.
* `ui.sidebarOpen` may fit a lightweight namespace.
* `auth`, `cart`, or a feature with setup/teardown work is a good module boundary.

Modules are still backed by the same global Store. Choose them because the feature needs a lifecycle and organizational boundary, not because they require a separate reactive engine.

---

## Next Steps

* **[Creating Stores](./creating.md)** — Global state, actions, batching, selectors, subscriptions, and namespaces.
* **[Persistent Stores](./persistence.md)** — IndexedDB persistence, hydration, and persistence controllers.
* **[Store Overview](./overview.md)** — Store mental model and state ownership.
* **[Store API Reference](../api/store.md)** — Exact signatures, options, and return values.
