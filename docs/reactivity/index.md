# Reactivity Overview

Udodi uses **fine-grained reactivity**: when reactive data changes, only the effects that depend on that data are scheduled to run.

The reactivity system is built from a small set of primitives:

* **Signals** provide dependency tracking and notification.
* **Effects** execute reactive work and automatically track dependencies.
* **Computed values** provide lazy, cached derivations.
* **Reactive objects** expose reactive top-level properties backed by signals.
* **Reactive collections** notify when their structure changes.
* **`touch()`** explicitly notifies dependents after an in-place nested mutation.
* **Reactive prop bindings** allow a component prop to remain connected to a parent's reactive value.

Higher-level Udodi features such as component state, computed properties, watchers, and template bindings build on these primitives.

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

A reactive value becomes a dependency when it is read while an effect is executing. Only the effects that subscribed to the changed dependency are scheduled. Unrelated effects do not run.

This produces a dependency graph rather than requiring a component or subtree to be re-evaluated after every state change.

## Core Primitives

| Primitive | What it does |
|-----------|--------------|
| **Signal** | Reactive value with getter, setter, and manual trigger |
| **Effect** | Executes a function and tracks the signals it reads |
| **Computed** | Lazily evaluates and caches a derived value |
| **Reactive object** | Shallow reactive object whose initial properties are backed by signals |
| **Reactive collections** | Reactive wrappers for arrays, `Map`, and `Set` |
| **`touch()`** | Explicitly notifies dependents of a reactive property |
| **`bindProp()`** | Creates a live reactive connection for component prop passing |

The primitives are deliberately small. Higher-level APIs compose them rather than introducing a separate reactivity model.

## Signals

A signal is the smallest reactive unit.

```js
import { createSignal, effect } from "udodi";

const [count, setCount, triggerCount] = createSignal(0);

effect(() => {
  console.log("count:", count());
});

setCount(1); // The effect is scheduled.
```

`createSignal()` returns three functions:

| Function | Behavior |
|----------|----------|
| `get()` | Returns the current value and records the active effect as a subscriber |
| `set(value)` | Replaces the value and notifies subscribers when `Object.is()` reports a change |
| `trigger()` | Notifies subscribers without replacing the stored value |

For example:

```js
const [user, , triggerUser] = createSignal({
  name: "John",
});

effect(() => {
  console.log(user().name);
});

user().name = "Jane";
triggerUser();
```

`trigger()` is useful when a value is mutated in place and its reference does not change.

Signals are the underlying mechanism used by reactive object properties and computed values.

## Effects

An effect executes immediately and records every reactive dependency read during its execution.

```js
import { reactive, effect } from "udodi";

const state = reactive({
  count: 0,
  label: "count",
});

effect(() => {
  console.log(state.label, state.count);
});

state.count++;
```

When an effect runs, Udodi:

1. Removes the effect from its previous dependency sets.
2. Clears the previous dependency set.
3. Makes the effect the currently active effect.
4. Executes the effect function.
5. Records every reactive value read during execution.
6. Restores the previous active effect.

This allows dependencies to change dynamically between executions.

For example:

```js
effect(() => {
  if (state.enabled) {
    console.log(state.value);
  }
});
```

When `enabled` is false, `value` is not read and therefore is not a dependency of that execution.

### Nested Effects

Effects use an internal stack so nested execution restores the previous active effect correctly. An outer effect remains the active effect after an inner effect finishes.

### Effect Cleanup

An effect can be disposed manually:

```js
const stop = effect(() => {
  console.log(state.count);
});

stop();
```

Disposal removes the effect from every dependency set it currently belongs to.

Effects can also be registered with a scope:

```js
const scope = {
  effects: [],
};

effect(() => {
  console.log(state.count);
}, scope);
```

The scope can later dispose its registered effects through the surrounding lifecycle system.

## Computed Values

`computed()` creates a lazy, cached derived value.

```js
import { reactive, computed, effect } from "udodi";

const state = reactive({
  a: 1,
  b: 2,
});

const sum = computed(() => state.a + state.b);

effect(() => {
  console.log("sum:", sum());
});
```

A computed value has three important properties:

* **Lazy**: its computation is not created until the computed getter is first accessed.
* **Cached**: repeated reads return the cached value.
* **Reactive**: when its dependencies change, the computation is re-evaluated.

Internally, the computed value creates an effect for its computation and a separate signal for its consumers. Consumers of the computed track the computed itself, not every upstream signal.

If the recomputed result is `Object.is()`-equal to the previous result, consumers are not notified.

```js
const doubled = computed(() => state.count * 2);
```

If `state.count` changes but `doubled` still produces an equivalent value, the computed does not propagate an unnecessary notification.

Computed values can also be attached to a reactive scope:

```js
const scope = {
  effects: [],
};

const total = computed(
  () => state.price * state.quantity,
  scope
);
```

The computed is reset when its scope cleanup runs.

## Reactive Objects

`reactive()` creates a **shallow reactive object**.

Despite the common terminology of "reactive proxy", the current implementation does **not** use JavaScript's `Proxy` API. Instead, the properties present when `reactive()` is called are installed with `Object.defineProperty()` accessors backed by individual signals.

```js
import { reactive, effect } from "udodi";

const state = reactive({
  count: 0,
  name: "Ada",
});

effect(() => {
  console.log(state.count);
});

state.count++;
```

Each initial property has its own signal. Changing `count` therefore only notifies subscribers of `count`.

### Shallow Reactivity

Nested plain objects are not recursively converted into reactive objects.

```js
const state = reactive({
  user: {
    name: "Ada",
  },
});

effect(() => {
  console.log(state.user.name);
});
```

The read of `state.user` is reactive, but `state.user.name` is a normal JavaScript property read on the nested plain object.

Therefore:

```js
state.user.name = "Grace";
```

does not automatically notify the `user` property's subscribers.

Use replacement when appropriate:

```js
state.user = {
  ...state.user,
  name: "Grace",
};
```

Or use `touch()` after an intentional in-place mutation:

```js
state.user.name = "Grace";
touch(state, "user");
```

### Initial Properties

Properties present during the call to `reactive()` become reactive properties.

```js
const state = reactive({
  count: 0,
});
```

The `count` property is backed by a signal.

A property added later through ordinary assignment is not automatically converted into a reactive property:

```js
state.name = "Ada";
```

`name` was not part of the original reactive property set, so this assignment does not create a new signal.

If dynamic reactive properties are required, initialize them as part of the reactive object or use another reactive structure designed for dynamic keys.

### Replacing Reactive Values

Existing reactive properties remain reactive when their values are replaced.

```js
const state = reactive({
  user: {
    name: "Ada",
  },
});

state.user = {
  name: "Grace",
};
```

The `user` property remains backed by the same property signal.

When the replacement value is an array, `Map`, or `Set`, Udodi wraps that collection for structural reactivity.

### Interceptors

Reactive objects can optionally define property interceptors.

```js
const state = reactive(
  {
    age: 18,
  },
  {
    interceptors: {
      age(value) {
        return Math.max(0, value);
      },
    },
  }
);
```

The interceptor receives the incoming value.

It may:

* Return the value unchanged.
* Return a transformed value.
* Return a different value.
* Return `undefined` to cancel the update.

For example:

```js
state.age = -10;

console.log(state.age); // 0
```

Cancellation:

```js
const state = reactive(
  {
    status: "idle",
  },
  {
    interceptors: {
      status(value) {
        if (value === "invalid") {
          return undefined;
        }

        return value;
      },
    },
  }
);

state.status = "invalid";

console.log(state.status); // "idle"
```

When no interceptors are supplied, the write path avoids interceptor lookup overhead.

## Reactive Collections

Arrays, `Map`, and `Set` receive specialized reactive wrappers when stored in reactive properties.

```js
const state = reactive({
  items: [],
  tags: new Set(),
  meta: new Map(),
});
```

Structural mutations notify subscribers of the owning reactive property.

```js
state.items.push({ id: 1 });
state.tags.add("javascript");
state.meta.set("version", 1);
```

### Supported Mutations

| Collection | Methods that notify |
|------------|---------------------|
| Array | `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin` |
| Map | `set`, `delete`, `clear` |
| Set | `add`, `delete`, `clear` |

For example:

```js
effect(() => {
  console.log(state.items.length);
});

state.items.push({ id: 1 });
```

The `items` dependency is notified by the collection wrapper.

### Collection Contents Remain Shallow

Reactive collection wrappers track structural changes to the collection. They do not recursively make objects contained inside the collection reactive.

```js
const state = reactive({
  items: [
    {
      name: "Ada",
    },
  ],
});

effect(() => {
  console.log(state.items);
});
```

Changing a field inside an item:

```js
state.items[0].name = "Grace";
```

does not itself produce a structural collection notification.

When an in-place nested mutation should invalidate consumers of `items`, use:

```js
touch(state, "items");
```

## `touch()`

`touch(proxy, key)` manually triggers the signal associated with a reactive property without replacing its value.

```js
import { reactive, effect, touch } from "udodi";

const state = reactive({
  user: {
    name: "Ada",
  },
});

effect(() => {
  console.log(state.user.name);
});

state.user.name = "Grace";

touch(state, "user");
```

`touch()` is particularly useful with Udodi's shallow reactivity model.

It:

* Does not change the stored value.
* Does not replace the object reference.
* Does not perform deep tracking.
* Simply notifies subscribers of the specified reactive property.

The key must be a string or symbol.

Prefer replacing the property when that is natural:

```js
state.user = {
  ...state.user,
  name: "Grace",
};
```

Use `touch()` when in-place mutation is required.

## Reactive Prop Bindings

Component props normally represent the value passed to the child.

When a prop needs to remain connected to a parent's reactive value, use `bindProp()`.

```js
import { bindProp } from "udodi";

ChildComponent({
  count: bindProp(() => ctx.count),
});
```

`bindProp()` creates a marked reactive binding rather than taking a snapshot of the current value. The getter is evaluated when the bound value is consumed, allowing the connection to remain live.

A normal prop remains a normal value:

```js
ChildComponent({
  count: ctx.count,
});
```

A bound prop creates a reactive tunnel:

```js
ChildComponent({
  count: bindProp(() => ctx.count),
});
```

## Scheduling

Reactive jobs are **batched and executed in a microtask**.

When a signal changes, its subscribers are placed into a shared job queue. The queue is a `Set`, so the same job is automatically deduplicated.

For example:

```js
state.count++;
state.count++;
state.count++;
```

An effect subscribed to `state.count` is not queued three times.

### Microtask Batching

Multiple synchronous updates share the same scheduled flush:

```js
state.firstName = "Ada";
state.lastName = "Lovelace";
state.age = 36;
```

The affected jobs are collected and then executed during the microtask flush.

### Cascading Jobs

Jobs may schedule additional jobs while a flush is already running. Those jobs are processed in subsequent passes of the same flush until the queue is empty.

This means reactive updates can cascade without creating a separate microtask for every individual dependency propagation.

### Error Isolation

Each job is executed independently. If one job throws an error, the scheduler reports the error and continues processing the remaining jobs. This prevents an exception in one reactive job from preventing unrelated queued jobs from running.

## How Components Use Reactivity

Udodi's higher-level component APIs build on the same primitives.

| Component feature | Reactivity primitive |
|-------------------|----------------------|
| `state()` | `reactive()` |
| `computed: { ... }` | `computed()` |
| `watch: { ... }` | Effects and dependency tracking |
| Template bindings | Effects that update the relevant DOM |
| Interceptors | `reactive(..., { interceptors })` |
| Nested object mutation | `touch()` |
| Collection mutation | Reactive collection wrappers |
| Live prop binding | `bindProp()` |

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

The same dependency rules apply throughout the system.

A reactive value is tracked when it is read during an active effect. When that value changes, the affected effect is scheduled.

## Mental Model

The reactivity system can be reduced to these rules:

1. **Read** reactive data inside an effect or computed computation to establish a dependency.
2. **Write** to an existing reactive property to notify subscribers when its value changes.
3. **Mutate collections** through their supported structural methods to notify the owning reactive property.
4. **Mutate nested plain objects in place** with `touch()` when their root reactive property needs to notify dependents.
5. **Jobs are asynchronous and deduplicated**: reactive effects are batched in a microtask and the same job is not queued repeatedly during the same flush.

The key distinction is **shallow versus deep reactivity**: only top-level properties present at construction are independently reactive. Nested plain objects and fields inside collection items are not tracked automatically, use replacement or `touch()` when those mutations should participate in updates.

This deliberate boundary keeps the core dependency system small and predictable while still providing explicit tools such as `touch()` and reactive collection wrappers when deeper mutation needs to participate in updates.
