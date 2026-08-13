# Effects

An **effect** runs a function immediately, tracks every reactive value read during that run, and re-runs the function when any of those values change.

Effects are the mechanism behind template bindings, watchers, and any side effect that should stay in sync with reactive state.

---

## Creating an Effect

```js
import { reactive, effect } from "udodi";

const state = reactive({ count: 0 });

const dispose = effect(() => {
  console.log("count:", state.count);
});

state.count++; // logs again
dispose();     // stop tracking; further changes do nothing
```

`effect(fn, scope?)` returns a **dispose** function. Calling it unsubscribes the effect from all current dependencies so it will not run again.

---

## Dependency Tracking

While an effect function runs, Udodi records every signal or reactive property that is read:

```js
const state = reactive({
  a: 1,
  b: 2,
  mode: "a",
});

effect(() => {
  if (state.mode === "a") {
    console.log(state.a);
  } else {
    console.log(state.b);
  }
});
```

Only the branch that actually executes contributes dependencies for that run. If `mode` is `"a"`, changing `b` does not re-run the effect.

On every run the effect:

1. Removes itself from the previous dependency sets  
2. Clears its dependency set  
3. Runs the function (new reads re-subscribe)  
4. Leaves only the values read on *this* run as dependencies  

That is why conditional reads stay precise.

---

## Nested Effects

Effects may nest. Udodi keeps an effect stack so the inner effect becomes the “current” effect while it runs, then the outer effect is restored:

```js
effect(() => {
  console.log("outer", state.outer);

  effect(() => {
    console.log("inner", state.inner);
  });
});
```

Each effect has its own dependency set. Disposing the outer effect does not automatically dispose the inner one unless you wire that up yourself (or use a shared scope).

---

## Scopes

Pass an optional **scope** so the effect is registered for later cleanup:

```js
const scope = { effects: [], cleanups: [] };

effect(() => {
  // ...
}, scope);

// later — typically during component unmount
for (const stop of scope.effects) {
  stop();
}
```

Component instances use scopes so effects created for bindings, computed values, and watchers are disposed when the component unmounts. Application code can use the same pattern for manual lifetimes.

---

## What Runs Inside an Effect

Typical uses:

| Use | Example |
|-----|---------|
| Logging / debugging | `console.log(state.count)` |
| DOM updates | template directives (`@text`, `@class`, `@show`, …) |
| Syncing external systems | write to `localStorage`, call an imperative API |
| Derived bookkeeping | maintain a non-reactive cache or index |

Effects should be **idempotent** with respect to their dependencies: running them again with the same inputs should produce the same outcome. Avoid launching unbounded async work on every run without cancellation.

---

## Effects vs Computed

| | Effect | Computed |
|--|--------|----------|
| Purpose | Side effects | Derived values |
| Return value | Ignored | Cached and returned to callers |
| Laziness | Runs immediately | Runs on first read |
| Notifies consumers | No (it *is* the consumer) | Yes, when the derived value changes |
| Typical use | DOM, I/O, logging | `fullName`, `total`, filters |

```js
// Effect — does work
effect(() => {
  document.title = state.title;
});

// Computed — produces a value
const fullName = computed(() => `${state.first} ${state.last}`);
```

If you need a value for other code to read, use `computed`. If you need something to *happen*, use `effect`.

---

## Batching and Scheduling

When a dependency changes, the effect is **scheduled**, not run synchronously in the middle of the write.

- Jobs are queued in a `Set` (duplicates collapse).  
- A microtask flushes the queue.  
- Jobs scheduled during a flush run in subsequent passes until the queue is empty.

```js
state.a = 1;
state.b = 2;
// both writes schedule the same effect once; it runs after the current turn
```

You do not flush the queue manually; writes, collection mutations, and `touch()` drive scheduling.

---

## Disposal

```js
const stop = effect(() => {
  /* ... */
});

stop(); // unsubscribe from all deps; effect will not run again
```

Disposal:

1. Removes the effect from every signal/property subscriber set it was in  
2. Clears the effect’s dependency set  

After disposal, further changes to those values do not resurrect the effect. Create a new effect if you need tracking again.

When a scope is provided, the dispose function is also pushed onto `scope.effects` so bulk cleanup can run it later.

---

## Component Watchers

Component `watch` is implemented with effects. A watcher declares dependencies and a handler; the runtime runs an effect that reads those deps and calls the handler when they change (after the initial run).

```js
createComponent({
  state() {
    return { count: 0 };
  },

  watch: {
    onCount: {
      deps: ["count"],
      handler(newValues, oldValues) {
        console.log(oldValues.count, "→", newValues.count);
      },
    },
  },
});
```

For ad-hoc reactions outside the watcher API, use `effect` directly.

---

## Common Patterns

**Run when any of several fields change**

```js
effect(() => {
  // reading both establishes two dependencies
  syncForm(state.name, state.email);
});
```

**Gate work on a flag**

```js
effect(() => {
  if (!state.enabled) return;
  connect(state.url);
});
```

**Pair with explicit nested notification**

```js
effect(() => {
  renderUser(state.user);
});

state.user.name = "Grace";
touch(state, "user"); // effect re-runs
```

---

## API Summary

```js
const dispose = effect(fn, scope?);
```

| Argument | Description |
|----------|-------------|
| `fn` | Function to run; reactive reads inside it are tracked |
| `scope` | Optional `{ effects: Function[] }` (and related fields); dispose is registered on `scope.effects` |

| Return | Description |
|--------|-------------|
| `dispose` | Function that unsubscribes the effect |

---

## Constraints

| Behavior | Detail |
|----------|--------|
| Runs immediately | First execution happens before `effect` returns |
| Re-runs on dependency change | Scheduled via microtask batching |
| Conditional deps | Only values read on the current run are tracked |
| Nested effects | Supported via an effect stack |
| Disposal | Required to stop tracking; scopes help automate this |
| No return value used | Use `computed` when you need a derived value |

---

## Next Steps

* [Signals](./signals.md) — the values effects subscribe to  
* [Reactive State](./reactive-state.md) — `reactive()` and interceptors  
* [Using `touch()`](./touch.md) — notifying after nested mutations  
* [Reactivity Overview](./overview.md) — how effects fit the full model  
