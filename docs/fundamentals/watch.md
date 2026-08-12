# Watchers

Watchers run **side effects in response to changes in top-level reactive state**.

They are declared with the `watch` option of `createComponent()`. Each watcher specifies the state keys it depends on and a handler that runs when at least one of those dependencies changes.

```js
import { createComponent, html, render } from "udodi";

const Counter = createComponent({
  name: "Counter",

  state() {
    return {
      count: 0,
      step: 1,
    };
  },

  watch: {
    countChange: {
      deps: ["count"],

      handler(newValues, oldValues) {
        console.log(
          `Count changed from ${oldValues.count} to ${newValues.count}`,
        );
      },
    },
  },

  methods: {
    increment() {
      this.count += this.step;
    },
  },

  template: () => html`
    <main>
      <p>Count: <span @text="count"></span></p>
      <button @on="click=increment">+</button>
    </main>
  `,
});

render(Counter(), "#app");
```

A watcher does **not** invoke its handler during its initial evaluation. Udodi first records the current values of its dependencies, then invokes the handler only when a subsequent evaluation detects a change.

Use watchers for side effects such as:

* persisting state
* synchronizing with external systems
* logging or analytics
* triggering asynchronous work
* responding to state changes that cannot be represented as derived data

If you only need to calculate a value for the UI, use a [computed value](./computed.md) instead.

---

## Defining Watchers

Watchers are declared as configuration objects under the `watch` option:

```js
watch: {
  countChange: {
    deps: ["count"],

    handler(newValues, oldValues) {
      console.log(newValues.count);
      console.log(oldValues.count);
    },
  },
},
```

Each watcher configuration contains:

| Field     | Purpose                                               |
| --------- | ----------------------------------------------------- |
| `deps`    | Array of top-level state keys to observe              |
| `handler` | Function called after one or more dependencies change |

The key used for the watcher itself, such as `countChange`, is a **configuration label**.

It is not exposed on the component context and does not participate in the root-level namespace registry.

For example:

```js
watch: {
  countChange: {
    deps: ["count"],
    handler() {},
  },
},
```

does not create:

```js
this.countChange
```

The label only identifies the watcher configuration. The runtime iterates over the watcher entries directly rather than registering their names as component context keys.

---

## Handler Signature

A watcher handler receives **two objects**:

```js
handler(newValues, oldValues) {
  // ...
}
```

### `newValues`

An object containing the **current value of every dependency**.

### `oldValues`

An object containing the **previous value of every dependency**.

For example:

```js
watch: {
  formChange: {
    deps: ["email", "password"],

    handler(newValues, oldValues) {
      console.log("new email:", newValues.email);
      console.log("old email:", oldValues.email);

      console.log("new password:", newValues.password);
      console.log("old password:", oldValues.password);
    },
  },
},
```

Both objects contain all keys declared in `deps`.

If only `email` changes, `password` is still present in both objects:

```js
newValues = {
  email: "new@example.com",
  password: "secret",
};

oldValues = {
  email: "old@example.com",
  password: "secret",
};
```

The handler therefore does **not** receive only the changed value. It receives a pair of dependency maps representing the current and previous values of the keys declared in `deps`.

This is important when using multiple dependencies: the handler can determine both which values changed and which values remained the same.

The runtime constructs these two objects on every watcher evaluation and calls the handler with them when at least one dependency has changed.

---

## Handler Context

The handler is called with the component's **public context as `this`**:

```js
watch: {
  countChange: {
    deps: ["count"],

    handler(newValues, oldValues) {
      console.log(this.name);

      console.log("current:", newValues.count);
      console.log("previous:", oldValues.count);

      this.reset();
    },
  },
},
```

This is the same public context used by component methods.

The handler can therefore access:

* reactive state
* computed values
* methods
* props
* `refs`
* `name`
* `ud`
* `cleanup` when the component has been mounted

For example:

```js
watch: {
  countChange: {
    deps: ["count"],

    handler(newValues) {
      if (newValues.count > 10) {
        this.reset();
      }

      console.log("doubled:", this.doubled);
    },
  },
},
```

Use `newValues` and `oldValues` for the dependency snapshots. Use `this` when the handler needs access to the broader component context.

The runtime invokes the handler with `publicContextMembrane` as its `this` value.

---

## Top-Level Dependencies

Watcher dependencies are **top-level state keys**.

```js
deps: ["count"];   // valid
deps: ["user"];    // valid
deps: ["pricing"]; // valid
```

A nested path is not a separate watcher dependency:

```js
deps: ["user.name"]; // not a top-level state key
```

Watchers read their dependencies directly from the component's reactive state store:

```js
state() {
  return {
    user: {
      name: "Ada",
    },
  };
},

watch: {
  userChange: {
    deps: ["user"],

    handler(newValues) {
      console.log(newValues.user);
    },
  },
},
```

The watcher observes the root `user` value. It does not independently subscribe to `user.name`.

This follows Udodi's shallow component reactivity model: watcher dependencies are tracked at the first level of the component state.

---

## Nested State and `touch()`

Udodi's component state is **shallowly reactive**.

Consider:

```js
state() {
  return {
    user: {
      name: "Ada",
    },
  };
},
```

This mutates a nested property:

```js
this.user.name = "Grace";
```

The root `user` reference has not changed.

Therefore, a watcher on `user` does not receive a notification merely because `user.name` was mutated in place.

When an in-place nested mutation needs to notify dependents, call `touch()` for the root key:

```js
methods: {
  rename(name) {
    this.user.name = name;
    touch(this, "user");
  },
},
```

The watcher can then observe the notification:

```js
watch: {
  userChange: {
    deps: ["user"],

    handler(newValues, oldValues) {
      console.log(
        oldValues.user.name,
        "→",
        newValues.user.name,
      );
    },
  },
},
```

Alternatively, replace the root value:

```js
methods: {
  rename(name) {
    this.user = {
      ...this.user,
      name,
    };
  },
},
```

Root replacement produces a new root value and therefore notifies dependents.

See [State](./state.md) and [Using `touch()`](../reactivity/touch.md).

---

## Initial Evaluation Is Skipped

When a watcher is created, Udodi performs an initial evaluation to establish the previous values of its dependencies.

The handler is **not called during this initial evaluation**.

Conceptually:

```text
Component instance created
        │
        ▼
Watcher evaluates dependencies
        │
        ├── store initial values
        │
        └── do not call handler
        │
        ▼
A dependency changes
        │
        ▼
Watcher evaluates again
        │
        ▼
Compare previous/current values
        │
        ▼
At least one changed?
   ┌────┴────┐
   │         │
  No        Yes
   │         │
   ▼         ▼
stop     handler(
          newValues,
          oldValues
        )
```

The implementation maintains a `prevValues` object for each watcher. On the first effect execution, the current dependency values are stored and `initialized` is set without invoking the handler. On later executions, the handler runs only when `Object.is()` detects a difference.

This prevents the initial state from being interpreted as a change.

---

## Change Detection

A watcher compares each dependency using `Object.is()`:

```js
Object.is(previous, current)
```

The handler runs when **at least one** dependency differs.

For primitive values:

```text
count: 1 → 2
```

is a change.

While:

```text
count: 1 → 1
```

is not.

For objects, comparison is by reference:

```js
previousUser !== currentUser
```

means the dependency changed.

If the same object reference remains:

```js
previousUser === currentUser
```

`Object.is()` considers it unchanged.

This is why `touch()` is important when an object is mutated in place and dependents need to be notified.

The watcher implementation explicitly uses `Object.is(previous, current)` for each dependency.

---

## Multiple Dependencies

A watcher can observe multiple state keys:

```js
watch: {
  formChange: {
    deps: ["email", "password"],

    handler(newValues, oldValues) {
      persistDraft({
        email: newValues.email,
        password: newValues.password,
      });
    },
  },
},
```

The handler runs when **any** dependency changes.

If only `email` changes:

```js
Object.is(oldValues.email, newValues.email);
// false
```

while:

```js
Object.is(oldValues.password, newValues.password);
// true
```

the watcher still runs because at least one dependency changed.

Both dependency keys remain available:

```js
handler(newValues, oldValues) {
  console.log(newValues.email);
  console.log(newValues.password);

  console.log(oldValues.email);
  console.log(oldValues.password);
},
```

The handler receives a complete snapshot of the declared dependencies, not a map containing only the changed keys.

---

## Multiple Watchers

A component can define multiple independent watchers:

```js
watch: {
  countChange: {
    deps: ["count"],

    handler(newValues) {
      console.log("count:", newValues.count);
    },
  },

  stepChange: {
    deps: ["step"],

    handler(newValues) {
      console.log("step:", newValues.step);
    },
  },

  counterChange: {
    deps: ["count", "step"],

    handler(newValues) {
      console.log(
        "counter changed:",
        newValues.count,
        newValues.step,
      );
    },
  },
},
```

Each watcher maintains its own dependency snapshot and change detection.

Do not make application logic depend on the execution order of multiple watchers that happen to respond to the same state change.

---

## Watcher Labels Are Not Context Keys

Watcher labels do not become root-level component properties.

For example:

```js
watch: {
  countChange: {
    deps: ["count"],
    handler() {},
  },
},
```

does not create:

```js
this.countChange
```

and `countChange` does not participate in namespace collision checks.

This differs from:

* `state`
* `computed`
* `methods`
* `props`

whose names become part of the component's root namespace. The component registry validates those namespaces for collisions, while watcher labels are simply configuration entries.

---

## Watchers and Methods

Methods perform explicit actions. Watchers define **when behavior should occur in response to state changes**.

A watcher can call a method:

```js
methods: {
  persistCount(count) {
    localStorage.setItem(
      "count",
      String(count),
    );
  },
},

watch: {
  countChange: {
    deps: ["count"],

    handler(newValues) {
      this.persistCount(newValues.count);
    },
  },
},
```

This keeps the responsibilities separate:

* the **watcher** defines the reactive trigger
* the **method** contains reusable behavior

The method can then be called from elsewhere in the component without duplicating the persistence logic.

---

## Watchers and Computed Values

Watchers and computed values both respond to reactive state, but they serve different purposes.

|                   | Watcher                             | Computed                     |
| ----------------- | ----------------------------------- | ---------------------------- |
| Purpose           | Perform side effects                | Produce derived data         |
| Trigger           | Listed dependencies change          | Dependencies invalidate/read |
| Result            | Handler execution                   | Cached derived value         |
| Arguments         | `newValues`, `oldValues`            | Public component context     |
| Initial execution | Handler skipped                     | Lazy                         |
| Typical use       | Persistence, logging, external sync | Totals, labels, flags        |

For example, this is a computed value:

```js
computed: {
  doubled(ctx) {
    return ctx.count * 2;
  },
},
```

It describes a value.

This is a watcher:

```js
watch: {
  countChange: {
    deps: ["count"],

    handler(newValues) {
      localStorage.setItem(
        "count",
        String(newValues.count),
      );
    },
  },
},
```

It performs a side effect.

A useful rule is:

> **Use computed values to derive data. Use watchers to react to changes with side effects.**

---

## Watchers, Computed Values, and Methods

The three APIs have distinct responsibilities:

```js
const Counter = createComponent({
  state() {
    return {
      count: 0,
    };
  },

  computed: {
    doubled(ctx) {
      return ctx.count * 2;
    },
  },

  watch: {
    countChange: {
      deps: ["count"],

      handler(newValues, oldValues) {
        console.log(
          "count changed:",
          oldValues.count,
          "→",
          newValues.count,
        );
      },
    },
  },

  methods: {
    increment() {
      this.count++;
    },
  },
});
```

Conceptually:

```text
state
  │
  ├──> computed ──> derived value
  │
  └──> watch ─────> side effect

methods ──────────> explicit behavior
```

---

## Synchronizing with the Global Store

The component `watch` API and the global store's `subscribe()` API are separate mechanisms.

A component watcher receives:

```js
handler(newValues, oldValues)
```

where `newValues` and `oldValues` are objects containing the watcher's dependency keys.

The global store's subscription API instead receives the individual current and previous store values:

```js
store.subscribe("count", (next, prev) => {
  console.log(next);
  console.log(prev);
});
```

The two callback signatures should not be confused.

### Component Watcher → Global Store

A component watcher can synchronize component state into the global store:

```js
import { createComponent, html, render, store } from "udodi";

const Counter = createComponent({
  name: "Counter",

  state() {
    return {
      count: 0,
    };
  },

  watch: {
    countChange: {
      deps: ["count"],

      handler(newValues) {
        store.set("count", newValues.count);
      },
    },
  },

  methods: {
    increment() {
      this.count++;
    },
  },

  template: () => html`
    <button @on="click=increment">
      Count: <span @text="count"></span>
    </button>
  `,
});

render(Counter(), "#app");
```

The flow is:

```text
component state
      │
      ▼
watch handler
      │
      ▼
newValues.count
      │
      ▼
store.set("count", value)
      │
      ▼
global store
```

The store exposes `set(key, value)` for writing a state value.

### Subscribing to the Global Store

If the requirement is to observe a global store key directly, use `store.subscribe()`:

```js
const unsubscribe = store.subscribe(
  "count",
  (next, prev) => {
    console.log("count:", prev, "→", next);
  },
);
```

Unlike a component watcher, the store subscription callback receives the value itself rather than `newValues` and `oldValues` maps.

`subscribe()` also returns the effect's cleanup function, which can be used when the subscription needs to be stopped explicitly.

This distinction is important:

```text
Component watch:

handler(newValues, oldValues)

Global store subscription:

callback(next, prev)
```

Use component `watch` when reacting to component state. Use `store.subscribe()` when reacting directly to global store state.

---

## Persisting State with a Watcher

A watcher can persist a component value:

```js
watch: {
  persistCount: {
    deps: ["count"],

    handler(newValues) {
      localStorage.setItem(
        "count",
        String(newValues.count),
      );
    },
  },
},
```

Because the initial watcher handler is skipped, this runs only after a subsequent `count` change.

If the application already uses Udodi's global store persistence facilities, it may be preferable to persist the store key directly rather than introducing a component watcher solely for persistence.

---

## Synchronizing an External System

A watcher can synchronize state with an external system:

```js
watch: {
  syncUser: {
    deps: ["user"],

    handler(newValues) {
      externalStore.setUser(newValues.user);
    },
  },
},
```

If `user` is mutated in place, use:

```js
this.user.name = "Grace";
touch(this, "user");
```

or replace the root value:

```js
this.user = {
  ...this.user,
  name: "Grace",
};
```

when the external system needs to be notified.

---

## Reacting to Several Fields Together

```js
watch: {
  draftChange: {
    deps: ["title", "body"],

    handler(newValues, oldValues) {
      markDraftDirty(
        newValues.title,
        newValues.body,
      );
    },
  },
},
```

The handler receives both fields regardless of which one caused the watcher to run.

For example, if only `title` changes:

```js
newValues.title !== oldValues.title;
```

while:

```js
newValues.body === oldValues.body;
```

the handler still receives both keys.

---

## Comparing Previous and Current Values

`oldValues` is useful when behavior depends on the transition between states rather than only the current value:

```js
watch: {
  statusChange: {
    deps: ["status"],

    handler(newValues, oldValues) {
      if (
        oldValues.status !== "loading" &&
        newValues.status === "loading"
      ) {
        console.log("Loading started");
      }
    },
  },
},
```

Because the initial handler invocation is skipped, `oldValues` represents the value captured by the previous watcher evaluation when the handler actually runs.

---

## Triggering Asynchronous Work

A watcher can initiate asynchronous work:

```js
watch: {
  searchChange: {
    deps: ["search"],

    handler(newValues) {
      this.searchUsers(newValues.search);
    },
  },
},

methods: {
  async searchUsers(query) {
    const results = await api.search(query);
    this.results = results;
  },
},
```

For asynchronous data fetching, prefer the [Query Pool](../query-pool/overview.md) instead of managing requests directly inside a watcher.

The Query Pool is designed for reactive queries and mutations and provides capabilities such as:

- Request cancellation
- Dependency-aware execution
- Caching
- Invalidation
- Deduplication and concurrency control
- Loading and error state
- Streaming
- Local and worker-based execution

A watcher is primarily a reactive side-effect trigger. It does not itself provide request cancellation, caching, stale-result handling, or a concurrency policy.

Use a watcher when a state change needs to trigger a side effect that does not require query lifecycle management. For reactive data fetching or other managed asynchronous workflows, use the [Query Pool](../query-pool/overview.md) instead.

---

## Watchers and Cleanup

Watcher effects are registered in a component-specific watcher scope:

```js
const watcherScope = {
  effects: [],
  cleanups: [],
};
```

Each watcher effect is registered against that scope. This gives watcher effects a component-scoped lifetime.

When the component is unmounted, the component lifecycle cleans up its associated reactive resources, so watcher effects do not remain subscribed after the component has been removed.

You therefore do not need to manually unregister a component `watch` declaration.

This is different from resources created **inside the handler**.

For example, if a handler creates a timer, subscription, observer, or other external resource, that resource has its own lifetime and should be cleaned up separately:

```js
watch: {
  enabledChange: {
    deps: ["enabled"],

    handler(newValues) {
      if (!newValues.enabled) {
        return;
      }

      const unsubscribe = externalStore.subscribe(() => {
        // ...
      });

      this.cleanup?.(unsubscribe);
    },
  },
},
```

`this.cleanup()` registers the external resource's cleanup with the component lifecycle. It does **not** unregister the watcher itself.

For resources whose lifetime should span the entire mounted component, `onMount` is generally a better place to establish the resource.

See [Lifecycle](./lifecycle.md).

---

## Avoiding Feedback Loops

A watcher can update state, but care is required when it writes to one of its own dependencies.

For example:

```js
watch: {
  countChange: {
    deps: ["count"],

    handler(newValues) {
      this.count = newValues.count + 1;
    },
  },
},
```

The handler changes `count`, which can cause the watcher to run again.

This can produce repeated updates or an unintended feedback loop.

If a watcher needs to update one of its dependencies, ensure there is a clear termination condition:

```js
watch: {
  normalizeCount: {
    deps: ["count"],

    handler(newValues) {
      if (newValues.count < 0) {
        this.count = 0;
      }
    },
  },
},
```

For transformations that should happen whenever a root state value is assigned, an [interceptor](./interceptors.md) may be a better fit.

---

## Watchers and Interceptors

Interceptors and watchers operate at different stages of state updates.

An interceptor transforms or cancels a root-level state assignment:

```js
interceptors: {
  count(value) {
    return Math.max(0, value);
  },
},
```

A watcher observes the resulting reactive state:

```js
watch: {
  countChange: {
    deps: ["count"],

    handler(newValues, oldValues) {
      console.log(
        oldValues.count,
        "→",
        newValues.count,
      );
    },
  },
},
```

Use:

* **interceptors** to control what value gets committed
* **watchers** to react to changes in committed reactive state

See [Interceptors](./interceptors.md).

---

## Watchers and State Replacement

Because watcher dependencies are root-level values, replacing a root object is observable:

```js
this.user = {
  name: "Grace",
};
```

A watcher on `user` receives the previous and current root values:

```js
watch: {
  userChange: {
    deps: ["user"],

    handler(newValues, oldValues) {
      console.log(oldValues.user);
      console.log(newValues.user);
    },
  },
},
```

This differs from:

```js
this.user.name = "Grace";
```

The latter mutates the existing object rather than replacing the root state value.

If that nested mutation needs to notify dependents, use:

```js
touch(this, "user");
```

or replace the root value.

---

## Constraints

| Constraint             | Behavior                                                                |
| ---------------------- | ----------------------------------------------------------------------- |
| Top-level dependencies | `deps` identifies root-level state keys                                 |
| Nested paths           | Nested paths are not independently tracked                              |
| Initial evaluation     | Dependency values are recorded but the handler is skipped               |
| Change detection       | Each dependency is compared with `Object.is()`                          |
| Multiple dependencies  | Handler runs when at least one dependency changes                       |
| Handler arguments      | Receives `newValues` and `oldValues` objects                            |
| Dependency snapshots   | Both objects contain every key declared in `deps`                       |
| Handler context        | `this` is the public component context                                  |
| Watcher labels         | Labels are configuration names, not context properties                  |
| Nested mutation        | In-place nested changes require `touch()` or root replacement to notify |
| Watcher lifetime       | Watcher effects are scoped to the component instance                    |
| External resources     | Resources created by handlers require their own cleanup                 |
| Feedback loops         | Writing watched state can trigger the watcher again                     |

---

## Minimal Example

```js
import { createComponent, html, render } from "udodi";

const Counter = createComponent({
  name: "Counter",

  state() {
    return {
      count: 0,
    };
  },

  watch: {
    countChange: {
      deps: ["count"],

      handler(newValues, oldValues) {
        console.log(
          oldValues.count,
          "→",
          newValues.count,
        );
      },
    },
  },

  methods: {
    increment() {
      this.count++;
    },
  },

  template: () => html`
    <button @on="click=increment">
      Count: <span @text="count"></span>
    </button>
  `,
});

render(Counter(), "#app");
```

The initial `count` value is recorded without invoking the handler. Each subsequent change to `count` produces a `newValues` / `oldValues` pair and invokes the handler.

---

## Next Steps

* [Components](./components.md) — the component model and root-level behavior
* [State](./state.md) — reactive state and shallow updates
* [Computed Values](./computed.md) — derived values instead of side effects
* [Methods](./methods.md) — explicit actions and reusable behavior
* [Interceptors](./interceptors.md) — transforming or cancelling root-level state writes
* [Lifecycle](./lifecycle.md) — mounting, unmounting, and cleanup
* [Using `touch()`](../reactivity/touch.md) — notifying after nested mutations
* [Reactivity Overview](../reactivity/overview.md) — signals, effects, and reactive primitives
