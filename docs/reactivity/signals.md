# Signals

A **signal** is Udodi's lowest-level reactive primitive: a reactive cell that stores a value, tracks which reactive computations depend on it, and notifies those dependencies when the value changes.

Signals form the foundation of Udodi's reactivity system. Higher-level primitives such as reactive objects, computed values, effects, and template bindings build on the same dependency-tracking mechanism.

---

## Creating a Signal

```js
import { createSignal, effect } from "udodi";

const [count, setCount, triggerCount] = createSignal(0);
```

`createSignal(initialValue)` returns a tuple of three functions:

| Function | Role |
|----------|------|
| **get** | Returns the current value; registers the active effect as a subscriber |
| **set** | Updates the value when it is not `Object.is`-equal, then notifies subscribers |
| **trigger** | Notifies subscribers **without** changing the stored value |

```js
effect(() => {
  console.log("count is", count());
});

setCount(1); // logs: count is 1
setCount(1); // no-op (same value)
```

---

## Reading

Call the getter to read the value:

```js
const value = count();
```

If a signal is read while an effect (or the internal effect of a computed) is active, that effect is added to the signal’s subscriber set. Later writes or triggers will schedule that effect to run again.

Reading outside any active effect does not create a subscription.

---

## Writing

```js
setCount(5);
setCount((/* not supported — pass the next value directly */));
```

`set`:

1. Compares the next value to the current one with `Object.is`
2. Returns immediately if they are the same
3. Otherwise stores the new value and notifies all subscribers

There is no updater-function form; pass the next value explicitly.

```js
setCount(count() + 1);
```

---

## Triggering Without Changing the Value

The third tuple element is a **manual trigger**:

```js
const [user, setUser, triggerUser] = createSignal({ name: "Ada" });

effect(() => {
  console.log(user().name);
});

// In-place mutation — setUser is not called
user().name = "Grace";

// Notify dependents without replacing the object
triggerUser();
```

Use `trigger` when:

- The signal holds an object or collection that was mutated in place
- You need dependents to re-run even though the reference did not change

For reactive objects created with `reactive()`, prefer `touch(proxy, key)` at the property level; `trigger` is the same idea at the raw signal level.

---

## Equality

Updates use `Object.is` for equality:

| Comparison | Result |
|------------|--------|
| `Object.is(1, 1)` | equal — no notify |
| `Object.is(NaN, NaN)` | equal — no notify |
| `Object.is(0, -0)` | not equal — notify |
| `Object.is({}, {})` | not equal — notify |

Replacing an object with a new reference always notifies, even if the contents are identical. Mutating an object in place does **not** notify unless you call `trigger` (or `touch` on a reactive property).

---

## Signals and Effects

```js
import { createSignal, effect } from "udodi";

const [first, setFirst] = createSignal("Ada");
const [last, setLast] = createSignal("Lovelace");

effect(() => {
  console.log(`${first()} ${last()}`);
});

setFirst("Grace"); // effect re-runs
setLast("Hopper"); // effect re-runs
```

Each run of the effect:

1. Unsubscribes from the previous dependency set  
2. Runs the function (new reads re-subscribe)  
3. Leaves only the signals actually read on that run as dependencies  

Conditional reads are therefore precise: a branch that is not taken does not subscribe.

---

## Signals and Computed Values

Computed values use signals internally:

- An internal signal tracks consumers of the computed  
- An internal effect recomputes when upstream dependencies change  
- Consumers of the computed subscribe to the computed’s signal, not to every upstream signal  

```js
import { createSignal, computed, effect } from "udodi";

const [a, setA] = createSignal(1);
const [b, setB] = createSignal(2);

const sum = computed(() => a() + b());

effect(() => {
  console.log("sum:", sum());
});

setA(3); // sum recomputes; effect runs
```

---

## Reactive Objects Are Built From Signals

`reactive()` allocates one signal per reactive property. Property access goes through the signal getter; assignment goes through the signal setter (and optional interceptors).

```js
// Conceptual model — not the public API
// state.count  ≈  get()
// state.count = 1  ≈  set(1)
```

You normally work with `reactive()` and component `state()` rather than raw signals, but understanding signals explains why shallow reactivity and `touch()` behave the way they do.

---

## Lifecycle of a Subscription

```text
effect runs
    │
    ▼
getter() called
    │
    ▼
effect added to signal.subscribers
effect.deps records that subscriber set
    │
    ▼
set() / trigger()
    │
    ▼
each subscriber scheduled (microtask)
    │
    ▼
effect runs again
    │
    ├── unsubscribes from previous deps
    └── re-subscribes via new reads
```

When an effect is disposed, it is removed from every subscriber set it was in, so it will not run again.

---

## API Summary

```js
const [get, set, trigger] = createSignal(initialValue);
```

| Call | Behavior |
|------|----------|
| `get()` | Return value; track active effect |
| `set(next)` | Update if not `Object.is`-equal; notify |
| `trigger()` | Notify without changing the value |

Return type: `[() => any, (next: any) => void, () => void]`

---

## When to Use Raw Signals

| Use case | Prefer |
|----------|--------|
| Component state | `state()` / `reactive()` |
| Derived values | `computed()` |
| Side effects tied to state | `effect()` or component `watch` |
| Standalone reactive cell outside components | `createSignal` |
| Manual notify after in-place mutation of a signal’s value | `trigger` |

Most application code stays at the reactive-object and component layers. Signals become useful when you need a single independent reactive cell, want to build an extension or library on top of Udodi's reactivity system, or need to understand how the higher-level reactive primitives are implemented.

---

## Next Steps

* [Effects](./effects.md) — dependency tracking and re-execution  
* [Reactive State](./reactive-state.md) — `reactive()` built on signals  
* [Using `touch()`](./touch.md) — property-level notification for nested data  
* [Reactivity Overview](./overview.md) — how the primitives fit together  
