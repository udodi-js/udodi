# Reactivity

Udodi uses fine-grained reactivity to update only the parts of the interface that depend on changed data.

Learn how Udodi’s reactive primitives work together, including signals, effects, computed values, reactive objects, collections, and explicit dependency notification.

---

## Guides

* [Reactivity Overview](./overview.md)
* [Signals](./signals.md)
* [Effects](./effects.md)
* [Reactive State](./state.md)
* [Reactive Collections](./collections.md)
* [Using `touch()`](./touch.md)

**Start here → [Reactivity Overview](./overview.md)**

---

## What Reactivity Means in Udodi

Udodi tracks dependencies at the **value** level, not the component level.

When reactive data is read inside an effect, computed, or template binding, Udodi records that dependency. When the data later changes, only the effects and computed values that actually used it are scheduled to run again.

```text
signal / reactive property
        │
        │ read inside effect / computed / binding
        ▼
   dependency graph
        │
        │ value changes
        ▼
 only dependent jobs re-run
```

This is the foundation of fine-grained updates: the runtime does not re-evaluate an entire component tree when a single field changes.

---

## Core Primitives

| Primitive | Role |
|-----------|------|
| **Signal** | Lowest-level reactive cell: get, set, and manual trigger |
| **Effect** | Runs a function and re-runs it when tracked dependencies change |
| **Computed** | Lazily derived value that caches until its dependencies change |
| **Reactive object** | Shallow reactive proxy backed by per-property signals |
| **Reactive collections** | Arrays, Maps, and Sets that notify on structural mutation |
| **`touch()`** | Explicitly notify dependents after an in-place nested mutation |

These primitives form the foundation for component `state()`, `computed` properties, watchers, and template directives.

---

## Shallow by Default

Reactive objects in Udodi are **shallow**.

- Top-level properties are tracked.
- Nested plain objects are **not** made reactive automatically.
- Arrays, Maps, and Sets assigned to reactive properties are wrapped so structural mutations notify the owning property.
- Deep field changes on nested plain objects require an explicit `touch(proxy, key)`.

```js
const state = reactive({
  user: { name: "Ada" },
  items: [],
});

// Tracked — replaces the top-level property
state.user = { name: "Attamah" };

// Not tracked automatically — nested plain object
state.user.name = "Attamah";
touch(state, "user"); // notify dependents of `user`

// Tracked — structural array mutation
state.items.push({ id: 1 });
```

This model keeps the dependency graph small and predictable while still supporting common collection updates without ceremony.

---

## Scheduling

Reactive jobs are batched and flushed in a microtask.

- Multiple updates in the same synchronous turn collapse into one flush.
- Duplicate jobs are deduplicated.
- Jobs scheduled during a flush run in a subsequent pass until the queue is empty.

You normally do not schedule work yourself; `set`, collection mutations, and `touch()` drive the queue.

---

## How the Pieces Fit Together

```text
createSignal / reactive()
        │
        ├── effect()          → side effects, DOM bindings, watchers
        │
        ├── computed()        → derived values
        │
        └── collections       → reactiveArray / reactiveMap / reactiveSet
                │
                └── touch()   → nested / in-place notification
```

In components, this surfaces as:

```text
state()            → reactive object
computed: { }      → computed getters
watch: { }         → effects over declared deps
template bindings  → effects that update the DOM
```

---

## When to Reach for Each Guide

| Goal | Guide |
|------|--------|
| Understand the overall model | [Reactivity Overview](./overview.md) |
| Work with the lowest-level primitive | [Signals](./signals.md) |
| Run code when dependencies change | [Effects](./effects.md) |
| Use reactive objects and interceptors | [Reactive State](./state.md) |
| Mutate arrays, Maps and Sets reactively | [Reactive Collections](./collections.md) |
| Notify after nested in-place changes | [Using `touch()`](./touch.md) |

---

## Design Notes

- **Fine-grained** — dependents subscribe to specific signals/properties, not whole components.
- **Shallow reactive objects** — nested plain objects are not auto-proxied; use `touch()` or replace the property.
- **Collection awareness** — arrays, Maps, and Sets get structural mutation tracking when stored on reactive state.
- **Explicit over magical** — deep mutations are opt-in via `touch()` rather than invisible deep proxies.
- **Batched** — updates are scheduled and flushed asynchronously in microtasks.

These choices keep the runtime small and the mental model stable as applications grow.

---

## Next Steps

* [Reactivity Overview](./overview.md) — start here for the full picture  
* [Signals](./signals.md) — the primitive reactive cell  
* [Effects](./effects.md) — dependency tracking and re-execution  
* [Reactive State](./state.md) — `reactive()` and interceptors  
* [Using `touch()`](./touch.md) — nested mutation notification  
