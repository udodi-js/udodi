# Persistent Stores

Udodi Store can persist selected state to IndexedDB so that application state survives page reloads.

Persistence is opt-in. It does not change how the Store is used: `get()`, `set()`, `update()`, and `touch()` remain synchronous. IndexedDB is involved only at the storage boundary, when persisted state is hydrated and when subsequent changes are written back.

For the global Store API, see [Creating Stores](./creating.md). For feature modules, see [Store Registry](./registry.md).

---

## How Persistence Fits the Store

The Store and IndexedDB have different responsibilities:

```text
             Application
                  │
                  ▼
          ┌───────────────┐
          │  Udodi Store  │
          │               │
          │ get / set     │
          │ update / touch│
          └───────┬───────┘
                  │
          persisted keys only
                  │
                  ▼
          ┌───────────────┐
          │  Persistence  │
          │    Layer      │
          └───────┬───────┘
                  │
                  ▼
              IndexedDB
```

The Store remains the source of truth for in-memory application state.

Persistence mirrors selected keys to IndexedDB and, when hydration is enabled, restores previously persisted values into the Store.

This means application code does not need a separate asynchronous API for persisted state:

```js
store.set("theme", "dark");

const theme = store.get("theme");
```

The same code works whether `theme` is persisted or not.

---

## Enabling Persistence

Call `store.persist()` with the keys you want to persist:

```js
import { store } from "udodi";

const controller = store.persist(
  ["theme", "locale"],
  {
    debounce: 50,
  },
);

await controller.ready;
```

A single key can also be passed directly:

```js
store.persist("theme");
```

or several keys:

```js
store.persist([
  "theme",
  "locale",
  "preferences",
]);
```

Duplicate keys are normalized automatically.

---

## Persisting Module State

Store modules expose the same persistence API using local module keys:

```js
defineStore("auth", {
  state: {
    token: null,
    user: null,
  },
});

const auth = useStore("auth");

const controller = auth.persist([
  "token",
  "user",
]);
```

The module automatically applies its namespace internally:

```text
token → auth:token
user  → auth:user
```

Application code therefore works entirely with local module keys.

---

## How Persistence Works

Calling `persist()` establishes a persistence controller:

```text
persist(keys, options)
        │
        ▼
   open IndexedDB
        │
        ▼
   hydrate? ───── yes ───► restore saved values
        │
        ▼
   subscribe to keys
        │
        ▼
   state changes
        │
        ▼
   schedule persistence
        │
        ▼
   IndexedDB transaction
```

The important part is that hydration happens before persistence subscriptions are installed when `hydrate` is enabled. This prevents restored values from immediately being treated as new changes and written back to IndexedDB.

Persistence also batches pending writes into IndexedDB transactions where possible.

### The asynchronous boundary

The Store itself remains synchronous:

```js
store.set("theme", "dark");

const theme = store.get("theme");
```

Only persistence setup and storage operations are asynchronous.

The primary synchronization point is:

```js
await controller.ready;
```

Use `ready` when application startup needs to wait until persisted state has been restored.

---

## Persistence Options

```js
const controller = store.persist(
  ["theme", "locale"],
  {
    dbName: "udodi-store",
    storeName: "state",
    hydrate: true,
    removeOnUndefined: true,
    debounce: 0,

    onError(error) {
      console.warn(error);
    },
  },
);
```

| Option | Default | Description |
| --- | --- | --- |
| `dbName` | `"udodi-store"` | IndexedDB database name. |
| `storeName` | `"state"` | IndexedDB object-store name. |
| `hydrate` | `true` | Restore persisted values before subscriptions are installed. |
| `removeOnUndefined` | `true` | Delete the IndexedDB entry when the Store value becomes `undefined`. |
| `debounce` | `0` | Delay before writing. `0` uses a microtask; a positive value coalesces rapid changes. |
| `onError` | `console.warn` | Receives IndexedDB errors. |

Modules use the same options. Their internal namespace prefix ensures that persisted keys belonging to different modules do not collide.

---

## The Persistence Controller

`persist()` returns a persistence controller:

```js
{
  keys,
  ready,
  flush,
  clear,
  stop,
}
```

The controller manages the persistence lifecycle for the selected keys.

### keys

`keys` contains the local keys managed by the controller:

```js
const controller = store.persist([
  "theme",
  "locale",
]);

console.log(controller.keys);
// ["theme", "locale"]
```

For a module controller, these remain local names even though the underlying Store keys are fully qualified.

### ready

`ready` is a Promise that resolves when persistence setup has completed:

```js
const controller = store.persist([
  "session",
]);

const ready = await controller.ready;
```

It resolves to:

* `true` when IndexedDB opened successfully, hydration completed when enabled, and subscriptions were installed;
* `false` when IndexedDB is unavailable, setup fails, or the controller is stopped before setup completes.

For startup code that depends on restored state:

```js
const controller = store.persist([
  "session",
]);

await controller.ready;

const session = store.get("session");
```

This creates a clean boundary:

```text
application startup
       │
       ▼
   persist()
       │
       ▼
  await ready
       │
       ▼
hydrated Store state
```

You do not need to await normal Store operations.

### flush()

`flush()` immediately writes all pending persistence changes:

```js
await controller.flush();
```

It:

* cancels any scheduled write timer;
* writes pending values immediately;
* resolves to `true` on success;
* resolves to `false` if the write fails.

This is useful when pending changes should be persisted before leaving a page or completing an important transition.

For example:

```js
window.addEventListener(
  "pagehide",
  () => {
    controller.flush();
  },
);
```

When using `flush()` in lifecycle events, remember that IndexedDB operations are asynchronous.

### clear()

`clear()` removes the controller's persisted entries:

```js
await controller.clear();
```

It does **not** change the in-memory Store.

```js
store.set("theme", "dark");

await controller.clear();

store.get("theme");
// "dark"
```

Persistence remains active after `clear()`:

```text
clear()
  │
  ├── remove persisted values
  ├── cancel pending writes
  │
  └── keep subscriptions active
             │
             ▼
      future changes
             │
             ▼
      persisted again
```

This distinction is important:

**`clear()` clears stored data, not Store state and not the persistence controller itself.**

### stop()

`stop()` permanently stops that controller from synchronizing further changes:

```js
controller.stop();
```

It:

* removes its Store subscriptions;
* cancels scheduled writes;
* keeps existing IndexedDB data;
* prevents future changes from being persisted by that controller.

```text
stop()
  │
  ├── unsubscribe
  ├── cancel pending writes
  │
  └── keep IndexedDB data
```

`stop()` therefore differs from `clear()`:

| Operation | IndexedDB data | In-memory state | Future changes |
| --- | --- | --- | --- |
| `clear()` | Removed | Unchanged | Continue persisting |
| `stop()` | Kept | Unchanged | No longer persisted |

---

## Hydration

Hydration restores previously persisted values into the Store.

It is enabled by default:

```js
const controller = store.persist([
  "theme",
]);

await controller.ready;
```

The persistence layer opens IndexedDB and reads the selected keys before installing write subscriptions. Only keys that actually have persisted values are restored. Missing entries leave the current in-memory value untouched.

### Example

On the first visit:

```js
store.set("theme", "dark");

const controller = store.persist([
  "theme",
]);

await controller.ready;
```

The value is written to IndexedDB.

On a later visit:

```js
const controller = store.persist([
  "theme",
]);

await controller.ready;

store.get("theme");
// "dark"
```

### Disable hydration

Use `hydrate: false` when persistence should only capture future changes:

```js
store.persist(
  ["analyticsId"],
  {
    hydrate: false,
  },
);
```

In this mode, existing IndexedDB values are not restored into the Store. Future changes are still persisted.

---

## What Gets Stored

Before values are written to IndexedDB, Udodi converts them into structured-clone-friendly data.

Supported structures include:

* primitives;
* plain objects;
* arrays;
* `Date`;
* `Map`;
* `Set`;
* nested structures.

Nested structures are cloned recursively, with cycle handling.

Reactive proxies and Udodi's internal reactive markers are not persisted as runtime objects. The stored representation is a plain data tree suitable for IndexedDB.

### undefined

By default:

```js
store.set("draft", undefined);
```

removes the corresponding persisted entry.

This is controlled by:

```js
removeOnUndefined: true
```

If you explicitly set:

```js
removeOnUndefined: false
```

the persistence layer retains `undefined` rather than deleting the IndexedDB entry.

---

## Debouncing Writes

Every change to a persisted key does not necessarily need an immediate IndexedDB transaction.

Use `debounce` to coalesce rapid changes:

```js
const controller = store.persist(
  ["draft"],
  {
    debounce: 200,
  },
);

store.set("draft", "a");
store.set("draft", "ab");
store.set("draft", "abc");
```

The rapid changes are coalesced into a later write rather than producing three immediate storage operations.

### debounce: 0

The default is:

```js
debounce: 0
```

This schedules persistence in a microtask rather than waiting for a timer.

### Positive debounce

```js
debounce: 200
```

waits for the specified period of inactivity before writing.

This is particularly useful for high-frequency state such as drafts:

```js
store.persist(
  ["draft"],
  {
    debounce: 300,
  },
);
```

### flush() overrides debounce

Regardless of the configured debounce:

```js
await controller.flush();
```

writes pending changes immediately.

---

## Error Handling

IndexedDB operations can fail; for example, while opening the database, hydrating data, or writing a transaction.

Provide `onError` to handle storage failures:

```js
const controller = store.persist(
  ["theme"],
  {
    onError(error) {
      reportToTelemetry(error);
    },
  },
);
```

If no handler is supplied, persistence reports errors with `console.warn` under the `[store.persist]` label.

Persistence failures do not turn normal Store operations into asynchronous failures. Your application can continue using:

```js
store.set("theme", "dark");
```

even if IndexedDB persistence encounters an error.

A failed write is re-queued only when there is not already a newer pending value for that same key. This prevents an older failed write from overwriting a newer queued value.

---

## Inactive Controllers

Persistence gracefully handles environments where IndexedDB cannot be used.

If IndexedDB is unavailable, setup fails, or no keys are supplied, the returned controller becomes inactive.

An inactive controller has:

```text
ready  → false
flush  → no-op
clear  → no-op
stop   → no-op
```

The Store itself continues to work normally.

This is an important property of the design: persistence is an optional capability, not a prerequisite for using Store state.

---

## Persistence and Store Lifecycle

Persistence is tied to the lifecycle of the Store keys it manages.

| Operation | Persistence behavior |
| --- | --- |
| `store.delete(key)` | Stops persistence for that key. |
| `module.delete(key)` | Same behavior for the module's fully qualified key. |
| `destroyStore(name)` | Removes tracked module keys and therefore stops their persistence. |
| `controller.stop()` | Unsubscribes and keeps existing IndexedDB data. |
| `controller.clear()` | Removes persisted entries but keeps subscriptions active. |
| `store.clear()` | Stops all persistence and clears Store state. |

You therefore do not need to manually stop a controller before deleting a persisted key or destroying its owning module.

The Store handles the associated persistence registration as part of key removal.

---

## Persistence and Modules

A module can persist its own state without exposing its internal namespace to application code:

```js
defineStore("auth", {
  state: {
    token: null,
    user: null,
  },
});

const auth = useStore("auth");

const controller = auth.persist([
  "token",
  "user",
]);

await controller.ready;
```

The application works with:

```text
token
user
```

while persistence internally operates on:

```text
auth:token
auth:user
```

This prevents state from different modules from colliding in the same IndexedDB object store.

When the module is destroyed:

```js
destroyStore("auth");
```

its tracked state keys are removed and their persistence registrations are stopped automatically.

---

## Full Example

The following example persists global preferences and authentication state owned by a module:

```js
import {
  store,
  defineStore,
  useStore,
  destroyStore,
} from "udodi";

// Global preferences
const preferences = store.persist(
  ["theme", "locale"],
  {
    debounce: 50,

    onError(error) {
      console.error(
        "Preference persistence failed:",
        error,
      );
    },
  },
);

await preferences.ready;

// Hydrated values are now available.
store.set(
  "theme",
  store.get("theme") ?? "system",
);

store.set(
  "locale",
  store.get("locale") ?? "en",
);

// Feature module
defineStore("auth", {
  state: {
    token: null,
    user: null,
  },

  actions: {
    async login(ctx, credentials) {
      const data = await api.login(
        credentials,
      );

      ctx.set("token", data.token);
      ctx.set("user", data.user);
    },

    logout(ctx) {
      ctx.set("token", null);
      ctx.set("user", null);
    },
  },
});

const auth = useStore("auth");

const authPersistence = auth.persist(
  ["token", "user"],
);

await authPersistence.ready;

// Force pending writes when needed.
window.addEventListener(
  "pagehide",
  () => {
    preferences.flush();
    authPersistence.flush();
  },
);

// Later, when the feature is unloaded:
// destroyStore("auth");
//
// This also stops persistence for
// the module's tracked keys.
```

The important sequence is:

```text
Application starts
      │
      ▼
persist()
      │
      ▼
await controller.ready
      │
      ▼
hydrated Store state
      │
      ▼
normal synchronous Store usage
      │
      ▼
Store changes
      │
      ▼
debounced persistence
      │
      ▼
IndexedDB
```

---

## When to Persist

| Good candidates | Usually avoid |
| --- | --- |
| Theme and locale preferences | Large temporary caches |
| Layout preferences | High-churn values that do not need persistence |
| User-created drafts | Server data that should be refetched |
| User-controlled feature preferences | Large Query Pool datasets |
| Session-related client state | Sensitive secrets without appropriate protection |

Persistence is particularly useful when the Store owns the state independently of a server-data lifecycle.

For asynchronous server data, caching, invalidation, retries, and mutations, prefer [Query Pool](../query-pool/README.md) rather than using persisted Store keys as a replacement for a server-data cache.

### Be deliberate with sensitive data

IndexedDB is client-side storage. Persisting authentication tokens or other sensitive values should be an explicit security decision.

Do not assume that because a value is stored in IndexedDB rather than `localStorage`, it is automatically safe from application-level compromise.

---

## Store Persistence vs Query Pool

The distinction is primarily about ownership:

| Concern | Store Persistence | Query Pool |
| --- | --- | --- |
| Client preferences | Excellent fit | Not intended |
| UI/application state | Excellent fit | Not intended |
| Drafts | Good fit | Not intended |
| Server responses | Usually avoid | Primary use case |
| Request caching | No | Yes |
| Invalidation | No | Yes |
| Retries | No | Yes |
| Async mutations | No | Yes |
| Server-data lifecycle | No | Yes |

A persisted Store value says:

> "This is application state that should survive a reload."

A Query Pool entry says:

> "This is asynchronous data whose freshness and request lifecycle Udodi manages."

Keeping those responsibilities separate prevents the Store from becoming an ad-hoc server-data cache.

---

## Next Steps

* **[Creating Stores](./creating.md)** — Global state, actions, batching, selectors, and subscriptions.
* **[Store Registry](./registry.md)** — Feature modules, reactive state, actions, and destruction.
* **[Store Overview](./overview.md)** — Store mental model, state ownership, and when to use Store versus Query Pool.
* **[Store API Reference](../api/store.md)** — Exact persistence signatures, options, and return values.
