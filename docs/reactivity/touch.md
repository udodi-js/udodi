# Using `touch()`

`touch(proxy, key)` notifies dependents of a **root reactive property** after you mutate data **in place** without replacing that property’s reference.

Use it when shallow reactivity does not see the change on its own.

---

## Why `touch()` Exists

Reactive objects are shallow. Nested plain objects and deep fields inside collections are not auto-tracked:

```js
import { reactive, effect, touch } from "udodi";

const state = reactive({
  user: { name: "Ada", age: 36 },
});

effect(() => {
  console.log(state.user.name);
});

state.user.name = "Grace"; // no notification by itself
touch(state, "user");      // effect runs
```

`touch` does **not** change the stored value. It only fires the property’s trigger so subscribers re-run.

---

## Signature

```js
touch(proxy, key) → boolean
```

| Argument | Description |
|----------|-------------|
| `proxy` | Reactive object from `reactive()`, or a component context that exposes `_state` |
| `key` | Root property name (`string` or `symbol`) |

Returns `true` if a trigger was found and invoked, otherwise `false` (unknown proxy or key).

```js
touch(state, "user");   // true when state.user is a reactive property
touch(state, "missing"); // false if there is no signal for that key
```

---

## When to Use It

| Situation | Use `touch`? |
|-----------|----------------|
| Nested field on a plain object | Yes |
| Deep field on an object inside an array/Map/Set | Yes |
| Array index assignment (`items[i] = x`) | Yes (or prefer methods / replace) |
| Structural collection method (`push`, `set`, …) | No — already notifies |
| Replacing the root property (`state.user = next`) | No — setter notifies |
| Primitive write (`state.count++`) | No — setter notifies |

---

## Nested Objects

```js
const state = reactive({
  settings: {
    theme: "light",
    density: "comfortable",
  },
});

effect(() => {
  applyTheme(state.settings.theme);
});

state.settings.theme = "dark";
touch(state, "settings");
```

Immutable-style alternative (no `touch`):

```js
state.settings = {
  ...state.settings,
  theme: "dark",
};
```

Both approaches notify dependents of `settings`. Prefer replacement when it stays readable; use `touch` when in-place mutation is required (performance, shared references, third-party APIs).

---

## Arrays

Structural methods already notify:

```js
state.items.push(row);    // notifies
state.items.splice(i, 1); // notifies
```

Deep element edits and index assignment do not:

```js
state.items[0].label = "Updated";
touch(state, "items");

state.items[i] = nextRow;
touch(state, "items");
```

Or replace:

```js
state.items = state.items.map((row, index) =>
  index === i ? { ...row, label: "Updated" } : row,
);
```

---

## Maps and Sets

```js
// Map value object mutated in place
const entry = state.meta.get("user");
entry.name = "Grace";
touch(state, "meta");

// Or replace the entry
state.meta.set("user", { ...entry, name: "Grace" });
```

```js
// Object identity in a Set — mutation does not change membership
for (const user of state.selected) {
  user.active = true;
}
touch(state, "selected");
```

---

## Component Context

Inside component methods, `this` is the public context. `touch` accepts that context because it resolves `proxy._state` when present:

```js
methods: {
  rename(next) {
    this.user.name = next;
    touch(this, "user");
  },
},
```

You can also touch the underlying reactive state if you hold a reference to it; the public context form is the usual pattern in components.

---

## Signals

Raw signals expose an equivalent idea as the third tuple element:

```js
const [user, setUser, triggerUser] = createSignal({ name: "Ada" });

user().name = "Grace";
triggerUser(); // same role as touch for a single signal
```

For reactive objects, prefer `touch(proxy, key)` so you target a specific property’s subscribers.

---

## What `touch` Does Not Do

- It does **not** deep-walk the object or invent subscriptions to nested fields.  
- It does **not** replace or clone the property value.  
- It does **not** notify other keys — only the key you pass.  
- It does **not** run if `key` is missing or the proxy is not reactive.

```js
touch(state, "user"); // only dependents of state.user
// dependents of state.count are unaffected
```

---

## Patterns

**Batch nested edits, touch once**

```js
state.user.name = "Grace";
state.user.age = 37;
touch(state, "user"); // one notification
```

**Touch after external / imperative mutation**

```js
mutateInPlace(state.draft); // third-party helper
touch(state, "draft");
```

**Prefer replace for simple updates**

```js
// Clear and readable — no touch needed
state.filters = { ...state.filters, query: q };
```

---

## API Summary

```js
import { touch } from "udodi";

const ok = touch(proxy, key);
```

| Item | Detail |
|------|--------|
| `proxy` | Reactive proxy or component context with `_state` |
| `key` | `string` or `symbol` root property |
| Returns | `boolean` — whether a trigger ran |
| Scheduling | Same microtask batching as normal writes |

---

## Constraints

| Behavior | Detail |
|----------|--------|
| Shallow notify | Only the named root property’s subscribers |
| No value change | Reference and contents unchanged by `touch` itself |
| Collections | Structural methods already call `touch` internally |
| Failure | Returns `false` for non-reactive targets or unknown keys |

---

## Next Steps

* [Reactive State](./state.md) — shallow rules and interceptors  
* [Reactive Collections](./collections.md) — when collections notify on their own  
* [Signals](./signals.md) — `trigger` on raw signals  
* [Effects](./effects.md) — what re-runs after a touch  
* [Reactivity Overview](./overview.md) — full model  
