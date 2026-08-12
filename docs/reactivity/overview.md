# Reactivity Overview

Udodi uses **fine-grained reactivity**: when data changes, only the code that actually depends on that data runs again.

This page explains the model at a high level, such as the primitives, how dependencies are tracked, how updates are scheduled, and how the same system powers component state, computed values, watchers, and template bindings.

---

## The Idea

In a coarse-grained system, a state change often re-runs a whole component (or a large subtree) and then reconciles the result.

In Udodi, reactive values form a dependency graph:

```text
signal / property
      │
      │ read while an effect is active
      ▼
  effect / computed records the dependency
      │
      │ value changes
      ▼
  only that effect / computed is scheduled
```

Updates are surgical. Unrelated effects do not re-run.

---

## Core Primitives

| Primitive | What it does |
|-----------|----------------|
| **Signal** | A reactive cell: read tracks, write notifies (optional manual trigger) |
| **Effect** | Runs a function; re-runs when any tracked dependency changes |
| **Computed** | Lazily derived value; caches until dependencies change |
| **Reactive object** | Shallow proxy; each own property is backed by a signal |
| **Reactive collections** | Array / Map / Set wrappers that notify on structural mutation |
| **`touch()`** | Explicitly notify after an in-place nested mutation |

Higher-level APIs (`state()`, component `computed`, `watch`, template directives) are built on these.

---

## Signals

A signal is the smallest reactive unit.

```js
import { createSignal, effect } from "udodi";

const [count, setCount, triggerCount] = createSignal(0);

effect(() => {
  console.log("count:", count());
});

setCount(1); // effect runs again
```

- **get** — returns the current value and, if an effect is active, registers that effect as a subscriber.
- **set** — updates the value when it is not `Object.is`-equal to the previous one, then notifies subscribers.
- **trigger** — notifies subscribers **without** changing the value (useful after in-place mutation of a nested structure held in the signal).

Signals are the substrate under reactive objects and computed values.

---

## Effects

An effect runs immediately, tracks every signal/property read during that run, and re-runs when any of those dependencies change.

```js
import { reactive, effect } from "udodi";

const state = reactive({ count: 0, label: "n" });

effect(() => {
  console.log(state.label, state.count);
});

state.count++; // effect re-runs
```

On each run the effect:

1. Unsubscribes from its previous dependency set  
2. Clears that set  
3. Runs the function (new reads re-subscribe)  
4. Restores the previous active effect (nested effects are supported)

Effects can be tied to a **scope** so they are disposed when the scope is cleaned up (components use this for lifecycle).

---

## Computed Values

A computed is a lazy, cached derivation.

```js
import { reactive, computed, effect } from "udodi";

const state = reactive({ a: 1, b: 2 });

const sum = computed(() => state.a + state.b);

effect(() => {
  console.log("sum:", sum());
});

state.a = 3; // sum recomputes; effect runs
```

Behavior:

- First access creates an internal effect that runs the computation.
- The result is cached.
- When a dependency changes, the computation re-runs; if the result is not `Object.is`-equal to the cache, consumers are notified.
- Consumers of the computed (other effects/computeds) track the computed itself, not every upstream signal.

Computed values are used for component `computed: { ... }` options and anywhere a derived value should stay in sync without manual invalidation.

---

## Reactive Objects

`reactive()` creates a **shallow** reactive proxy.

```js
import { reactive, effect } from "udodi";

const state = reactive({
  count: 0,
  user: { name: "Ada" },
});

effect(() => {
  console.log(state.count);
});

state.count++;           // tracked
state.user = { name: "Grace" }; // tracked (property replaced)
state.user.name = "Lin"; // not tracked automatically
```

Important rules:

- Only **own top-level properties** present at creation (and later assigned through the proxy in ways that go through signals) participate in tracking as reactive fields.
- Nested plain objects are **not** turned into reactive proxies.
- Assigning a new value to a reactive property notifies subscribers of that property.
- Optional **interceptors** can transform or cancel writes (return `undefined` to cancel).

This keeps the dependency graph small and avoids the cost and surprise of deep proxies.

---

## Collections

When an array, `Map`, or `Set` is stored on a reactive object, Udodi wraps it so **structural** mutations notify the owning property.

```js
const state = reactive({
  items: [],
  tags: new Set(),
  meta: new Map(),
});

state.items.push({ id: 1 });  // notifies "items"
state.tags.add("a");          // notifies "tags"
state.meta.set("k", 1);       // notifies "meta"
```

Supported structural methods include:

| Collection | Methods that notify |
|------------|---------------------|
| Array | `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin` |
| Map | `set`, `delete`, `clear` |
| Set | `add`, `delete`, `clear` |

Deep field changes on objects *inside* a collection are not tracked:

```js
state.items[0].name = "updated";
touch(state, "items"); // explicit notification
```

---

## `touch()`

Use `touch(proxy, key)` when you mutate nested data in place and still want dependents of a root reactive property to re-run.

```js
import { reactive, effect, touch } from "udodi";

const state = reactive({
  user: { name: "Ada", age: 36 },
});

effect(() => {
  console.log(state.user.name);
});

state.user.name = "Grace";
touch(state, "user"); // effect runs
```

`touch` does not change the stored reference; it only fires the property’s trigger. Prefer replacing the property when that is natural (`state.user = { ...state.user, name: "Grace" }`); use `touch` when in-place mutation is required.

---

## Scheduling

Updates are **batched** and flushed in a **microtask**.

- Multiple writes in the same synchronous turn share one flush.
- The same effect is not queued twice in one flush.
- Jobs scheduled while a flush is running are processed in follow-up passes until the queue is empty.

You rarely schedule work yourself; `set`, collection mutations, and `touch()` drive the queue.

---

## How Components Use This

| Component feature | Built on |
|-------------------|----------|
| `state()` | `reactive()` |
| `computed: { ... }` | `computed()` |
| `watch: { ... }` | `effect()` over declared deps |
| Template text/class/style/show/… | `effect()` that updates the DOM |
| Interceptors | `reactive(..., { interceptors })` |
| Nested / collection mutations | collection wrappers + `touch()` |

Conceptually:

```text
state / signals
      │
      ├── computed
      │
      ├── watch (effects)
      │
      └── template bindings (effects)
```

The same dependency rules apply everywhere: read while an effect is active → subscribe; write or `touch` → schedule dependents.

---

## Mental Model Checklist

1. **Read** reactive data inside an effect/computed/binding → dependency is recorded.  
2. **Write** a reactive property (or mutate a tracked collection) → dependents are scheduled.  
3. **Nested plain objects** are not auto-reactive → replace the property or call `touch`.  
4. **Collections** notify on structural change; deep item fields still need `touch` or replacement.  
5. **Jobs** run asynchronously in microtasks and are deduplicated per flush.

---

## Next Steps

* [Signals](./signals.md) — `createSignal` in detail  
* [Effects](./effects.md) — tracking, nesting, and disposal  
* [Reactive State](./state.md) — `reactive()` and interceptors  
* [Reactive Collections](./collections.md) — array, Map and Set  
* [Using `touch()`](./touch.md) — nested notification patterns  
* [Read-only State](./readonly.md) — immutable views of reactive data  
