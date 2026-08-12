# Reactive State

The `reactive()` creates a **shallow reactive object**: each own property is backed by a signal. Reading a property tracks the active effect; writing notifies that property’s subscribers.

Component `state()` is built on top of `reactive()`.

---

## Creating Reactive State

```js
import { reactive, effect } from "udodi";

const state = reactive({
  count: 0,
  name: "Ada",
});

effect(() => {
  console.log(state.count, state.name);
});

state.count++;     // effect re-runs
state.name = "Lin"; // effect re-runs
```

Only properties present on the initial object (and later managed through the proxy’s reactive path) participate as tracked fields. Nested plain objects are not made reactive automatically.

---

## Shallow Reactivity

Udodi tracks **top-level properties**, not deep trees.

```js
const state = reactive({
  user: { name: "Ada", age: 36 },
  items: [],
});

// Tracked — replaces the property
state.user = { name: "Grace", age: 36 };

// Not tracked — nested plain object field
state.user.name = "Grace";

// Explicit notification for nested mutation
import { touch } from "udodi";
touch(state, "user");
```

| Operation | Tracked? |
|-----------|----------|
| `state.count = 1` | Yes |
| `state.user = { ... }` | Yes |
| `state.user.name = "..."` | No (unless you `touch(state, "user")`) |
| `state.items.push(x)` | Yes (collection wrapper) |
| `state.items[0].id = 2` | No (unless you `touch(state, "items")`) |

This keeps the dependency graph small and avoids the cost and surprises of deep proxies.

---

## Reading and Writing

```js
const n = state.count;  // track if an effect is active
state.count = n + 1;    // notify if value changed (Object.is)
```

Writes use the same equality rule as signals: `Object.is`. Assigning an identical value does not notify.

---

## Interceptors

Interceptors run on write **before** the value is committed. They can transform the value or cancel the update.

```js
const state = reactive(
  { age: 18, count: 0 },
  {
    interceptors: {
      age(value) {
        return Math.max(0, value); // clamp
      },
      count(value) {
        if (value < 0) return undefined; // cancel
        return value;
      },
    },
  },
);

state.age = -5;  // becomes 0
state.count = -1; // ignored; count stays 0
```

| Interceptor return | Result |
|--------------------|--------|
| A value | That value is stored and may notify |
| `undefined` | Update is cancelled; property unchanged |

Interceptors receive the incoming value only. They are per-property functions on the options object passed to `reactive()`.

Component `interceptors` in `createComponent` use the same mechanism.

---

## Collections on Reactive State

When you assign an array, `Map`, or `Set` to a reactive property, Udodi wraps it so **structural** mutations notify the owning property.

```js
const state = reactive({
  items: [],
  tags: new Set(),
  meta: new Map(),
});

state.items.push({ id: 1 }); // notifies "items"
state.tags.add("ui");        // notifies "tags"
state.meta.set("v", 1);      // notifies "meta"
```

Replacing the collection also notifies:

```js
state.items = [{ id: 2 }];
```

Deep mutations inside collection elements still need `touch` or replacement of the element/property. See [Reactive Collections](./collections.md).

---

## Identity and the Proxy

`reactive()` returns a **proxy**. The proxy is what effects and the rest of the system should hold.

```js
const state = reactive({ count: 0 });

effect(() => {
  console.log(state.count); // always use the proxy
});
```

Do not dig out an internal target object and mutate that; writes must go through the proxy (or through APIs that call `touch` on the proxy).

---

## Component State

In components, prefer the `state()` option:

```js
import { createComponent, html, render } from "udodi";

const Counter = createComponent({
  name: "Counter",

  state() {
    return {
      count: 0,
    };
  },

  methods: {
    increment() {
      this.count++;
    },
  },

  template: () => html`
    <button @on="click=increment" @text="count"></button>
  `,
});

render(Counter(), "#app");
```

Rules of thumb:

- `state()` must be a **function** that returns a **fresh object** for each instance.  
- Returning the same object for multiple instances triggers a warning.  
- Root keys from state, computed, methods, and props must not collide.  
- Nested plain objects follow the same shallow rules as standalone `reactive()`.

---

## `touch()` for Nested Data

When in-place nested mutation is intentional:

```js
state.user.profile.theme = "dark";
touch(state, "user");
```

Prefer immutable-style updates when practical:

```js
state.user = {
  ...state.user,
  profile: { ...state.user.profile, theme: "dark" },
};
```

Both patterns notify dependents of `user`. `touch` avoids allocating a new object when mutation is required. Details: [Using `touch()`](./touch.md).

---

## What Is Not Reactive

| Value | Behavior |
|-------|----------|
| Nested plain object fields | Not tracked unless you `touch` or replace the parent property |
| Properties added only on the raw target (bypassing the proxy) | Not reactive |
| Non-object primitives held in signals | Fully tracked via get/set |
| Objects marked `__udodi_reactive__` | Not wrapped again |

---

## API Summary

```js
const state = reactive(initialState?, options?);
```

| Argument | Description |
|----------|-------------|
| `initialState` | Plain object; own enumerable keys become reactive properties |
| `options.interceptors` | Map of property name → `(value) => nextValue \| undefined` |

| Related | Description |
|---------|-------------|
| `touch(state, key)` | Notify dependents of `key` after in-place nested mutation |
| Collection assignment | Arrays, Maps, Sets are wrapped for structural notifications |

Returns a proxy. Use that proxy for all reads and writes.

---

## Mental Model

```text
reactive({ count: 0, user: { name: "Ada" } })
        │
        ├── count  → signal (get/set/trigger)
        │
        └── user   → signal holding a plain object
                     │
                     └── user.name  → not a signal
                                      (use replace or touch)
```

---

## Next Steps

* [Signals](./signals.md) — the per-property primitive under `reactive()`  
* [Effects](./effects.md) — how reads become subscriptions  
* [Reactive Collections](./collections.md) — arrays, Map and Set  
* [Using `touch()`](./touch.md) — nested notification  
* [Reactivity Overview](./overview.md) — full model  
