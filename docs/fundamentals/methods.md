# Methods

Methods define the **behavior of a component**. They are used for actions, event handlers, formatters, helpers, asynchronous operations, and other imperative logic that operates on the component context.

Declare methods with the `methods` option of `createComponent()`:

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

  methods: {
    increment() {
      this.count += this.step;
    },

    decrement() {
      this.count -= this.step;
    },

    reset() {
      this.count = 0;
    },
  },

  template: () => html`
    <main>
      <p>Count: <span @text="count"></span></p>

      <button @on="click=decrement">−</button>
      <button @on="click=reset">Reset</button>
      <button @on="click=increment">+</button>
    </main>
  `,
});

render(Counter(), "#app");
```

Methods are exposed as root-level names on the component context, making them available to templates and other component code.

---

## Defining Methods

Each entry under `methods` is expected to be a function:

```js
methods: {
  increment() {
    this.count++;
  },

  reset() {
    this.count = 0;
  },

  formatCount(value) {
    return `Count: ${value}`;
  },
},
```

Non-function entries are ignored:

```js
methods: {
  increment() {
    this.count++;
  },

  // Ignored
  description: "Counter",
},
```

Method definitions are validated for root-level namespace collisions when `createComponent()` is called.

---

## The Method Context

When Udodi invokes a registered method, `this` refers to the component's **public context**.

This gives methods access to the values exposed by the component:

```js
methods: {
  increment() {
    this.count += this.step;
  },

  incrementAndLog() {
    this.increment();
    console.log("count:", this.count);
  },
},
```

Through `this`, a method can:

* read and write root-level state
* read computed values
* call other methods
* read component props
* access `this.refs`
* access `this.name`
* access `this.ud`
* register component cleanup with `this.cleanup()` after mounting

The method is invoked with the public context as its `this` value. Udodi does not expose the internal runtime context to the method.

This is important because state access through `this` continues to pass through the component's public context and reactive state system.

---

## Updating State

Methods are commonly used to update component state:

```js
methods: {
  setCount(value) {
    this.count = value;
  },

  increment() {
    this.count++;
  },
},
```

Root-level state assignments are handled by Udodi's reactive state system. If an interceptor is defined for that state key, the assignment passes through the interceptor before the value is committed.

For example:

```js
const Counter = createComponent({
  name: "Counter",

  state() {
    return {
      count: 0,
    };
  },

  interceptors: {
    count(value) {
      return Math.max(0, value);
    },
  },

  methods: {
    setCount(value) {
      this.count = value;
    },
  },
});
```

The method does not need to invoke the interceptor explicitly:

```js
this.setCount(-10);
```

The assignment to `this.count` goes through the reactive state layer.

See [Interceptors](./interceptors.md).

---

## Methods in Templates

Methods can be referenced by name through Udodi's template DSL.

Udodi templates do not use arbitrary JavaScript expressions inside directives. Instead, directive values resolve names and arguments through the component context.

### Event Handlers

The most common use of methods is handling DOM events with `@on`:

```html
<button @on="click=increment">+</button>
<button @on="click=decrement">−</button>
<button @on="click=reset">Reset</button>
```

The method name is resolved from the component context and invoked when the event occurs.

No JavaScript function expression is required in the template.

---

## Methods as Resolvers

Methods can also be used as resolvers by directives that accept method paths and arguments.

For example:

```js
methods: {
  formatCount(value) {
    return `Count: ${value}`;
  },

  currency(amount, code) {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: code || "USD",
    }).format(amount);
  },
},
```

They can then be referenced through the template DSL:

```html
<span @text="formatCount:count"></span>
<span @text="currency:total:'USD'"></span>
```

The first token identifies the method. Additional tokens are resolved according to the directive's argument and path syntax.

Methods used as resolvers are still ordinary component methods. The template runtime simply resolves their arguments and invokes them.

See [Template DSL](../templates/dsl.md).

---

## Calling Other Methods

Methods can call other methods through `this`:

```js
methods: {
  increment() {
    this.count++;
  },

  incrementBy(amount) {
    this.count += amount;
  },

  double() {
    this.incrementBy(this.count);
  },
},
```

Calling through `this` preserves the component context.

This is preferable to extracting a method and invoking it as an unrelated free function when the method depends on `this`:

```js
methods: {
  reset() {
    this.count = 0;
  },

  restart() {
    this.reset();
  },
},
```

---

## Methods and Computed Values

Methods and computed values solve different problems.

|              | Methods                                           | Computed                              |
| ------------ | ------------------------------------------------- | ------------------------------------- |
| Purpose      | Actions, helpers, and imperative logic            | Derived reactive values               |
| Invocation   | Explicitly invoked                                | Read as a property                    |
| Evaluation   | Runs when invoked                                 | Lazy and cached                       |
| Dependencies | Not tracked as computed dependencies              | Reactive reads are tracked            |
| Side effects | Appropriate when needed                           | Should generally be avoided           |
| Typical use  | Event handlers, mutations, formatters, async work | Totals, labels, flags, derived values |

Use a **method** when something should happen:

```js
methods: {
  increment() {
    this.count++;
  },
},
```

Use a **computed value** when something should be derived from existing values:

```js
computed: {
  doubled(ctx) {
    return ctx.count * 2;
  },
},
```

A useful rule is:

> **Methods perform behavior; computed values describe derived data.**

See [Computed Values](./computed.md).

---

## Methods and Reactivity

A method is not itself a reactive computation.

Calling a method does not establish a reactive dependency:

```js
methods: {
  logCount() {
    console.log(this.count);
  },
},
```

If `count` changes later, `logCount()` does not automatically run again.

Use a computed value when the goal is to derive a value:

```js
computed: {
  doubled(ctx) {
    return ctx.count * 2;
  },
},
```

Use a watcher when the goal is to perform behavior in response to state changes:

```js
watch: {
  countChanged: {
    deps: ["count"],

    handler(newValues, oldValues) {
      console.log(
        "Count changed:",
        oldValues.count,
        "→",
        newValues.count,
      );
    },
  },
},
```

The watcher handler receives **objects**, not a single value.

For:

```js
deps: ["count", "step"]
```

the handler receives:

```js
handler(newValues, oldValues) {
  // {
  //   count: ...,
  //   step: ...
  // }

  console.log(newValues.count);
  console.log(oldValues.count);
}
```

`newValues` contains the current values for the declared dependencies, while `oldValues` contains their previous values.

The handler is called with the component's public context as `this`:

```js
watch: {
  counter: {
    deps: ["count"],

    handler(newValues, oldValues) {
      console.log(this.name);
      console.log(newValues.count);
      console.log(oldValues.count);
    },
  },
},
```

Watchers observe **top-level reactive state keys**. Nested mutations are not independently tracked.

See [Watchers](./watch.md).

---

## Methods and Watchers

Methods and watchers can work together when a state change needs to trigger behavior.

For example:

```js
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

    reportChange(newValue, oldValue) {
      console.log(`Count changed from ${oldValue} to ${newValue}`);
    },
  },

  watch: {
    countChanged: {
      deps: ["count"],

      handler(newValues, oldValues) {
        this.reportChange(
          newValues.count,
          oldValues.count,
        );
      },
    },
  },
});
```

The method contains reusable behavior, while the watcher determines **when** that behavior should run.

Notice that the watcher does not receive `count` directly. It receives `newValues` and `oldValues`, from which the relevant dependency is selected.

---

## Methods and Nested State

Udodi's component state is reactive at the **top level**. Nested objects are not independently tracked.

For example:

```js
state() {
  return {
    user: {
      name: "Ada",
    },
  };
},
```

A method can mutate the nested object:

```js
methods: {
  rename(name) {
    this.user.name = name;
  },
},
```

However, an in-place nested mutation does not itself produce a root-level state assignment.

When dependents need to be notified, signal the root key with `touch()`:

```js
methods: {
  rename(name) {
    this.user.name = name;
    touch(this, "user");
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

Use `touch()` when you want to preserve the existing object while explicitly notifying dependents of the root-level change.

See [State](./state.md) and [Using `touch()`](../reactivity/touch.md).

---

## Methods and Props

Methods can read component props through the same public context:

```js
const Greeter = createComponent({
  name: "Greeter",

  methods: {
    greet() {
      console.log(`Hello, ${this.userName}`);
    },
  },

  template: () => html`
    <button @on="click=greet">Greet</button>
  `,
});
```

A parent can provide the prop when creating the component instance:

```js
Greeter({
  userName: "Ada",
});
```

Regular props are value snapshots. When a live reactive connection is required, Udodi supports explicitly reactive props.

See [Props](./props.md).

---

## Async Methods

Methods may be asynchronous:

```js
methods: {
  async save() {
    this.saving = true;

    try {
      await api.save({
        count: this.count,
      });
    } finally {
      this.saving = false;
    }
  },
},
```

The method remains an ordinary component method. Declaring it `async` simply means that it returns a promise.

Keep asynchronous status in reactive state when the UI needs to respond:

```js
state() {
  return {
    saving: false,
    error: null,
  };
},
```

Then expose that state declaratively:

```html
<button
  @on="click=save"
  @attr="disabled=saving"
>
  Save
</button>
```

This keeps UI state inside the component's reactive model instead of requiring imperative DOM updates.

---

## Accessing Element References

When a method needs direct access to a DOM element, use `@ref` and `this.refs`:

```js
methods: {
  focusInput() {
    this.refs.query?.focus();
  },
},
```

```html
<input @ref="query" />

<button @on="click=focusInput">
  Focus
</button>
```

Refs are appropriate when an operation inherently requires a DOM element, such as:

* focusing an input
* scrolling an element
* measuring an element
* interacting with a browser API

Prefer declarative bindings when direct DOM access is unnecessary.

---

## Registering Cleanup

Methods can register resource cleanup through `this.cleanup()`.

The cleanup function becomes available to the public context during mounting. Calling it registers a callback with the component's **mount scope**; it does not execute the callback immediately.

For example:

```js
methods: {
  startTimer() {
    const timer = setInterval(() => {
      // ...
    }, 1000);

    this.cleanup(() => {
      clearInterval(timer);
    });
  },
},
```

The callback remains registered until the component's mount scope is cleaned up.

### Component-scoped cleanup

Cleanup belongs to the component instance rather than to the method invocation:

```js
methods: {
  connect() {
    const connection = createConnection();

    this.cleanup(() => {
      connection.close();
    });
  },
},
```

If the method is called more than once, each invocation can register another cleanup callback. Methods that create repeatable resources should therefore avoid accidentally registering duplicate resources.

### Cleanup and lifecycle

`this.cleanup()` is a **resource cleanup registration mechanism**, not a lifecycle hook.

The distinction is:

* `onMount` runs after the component has been mounted.
* `onUnmount` participates in the component's unmount lifecycle.
* `this.cleanup(fn)` registers `fn` to run when the component's mount scope is cleaned up.

For example:

```js
methods: {
  subscribe() {
    const unsubscribe = store.subscribe(() => {
      // ...
    });

    this.cleanup(unsubscribe);
  },
},
```

This keeps ownership of the subscription with the component that created it.

Cleanup is also used when mounting fails after the mount scope has been established, allowing resources registered in that scope to be released.

---

## Methods and Lifecycle

Methods can be used by lifecycle hooks because lifecycle hooks receive the same public component context:

```js
const Example = createComponent({
  name: "Example",

  methods: {
    initialize() {
      // ...
    },
  },

  onMount(root, ctx) {
    ctx.initialize();
  },
});
```

The lifecycle callback receives the component root as its first argument and the public context as its second argument.

Similarly:

```js
onUnmount(root, ctx) {
  // component cleanup logic
},
```

The component's computed and watcher scopes are cleaned up as part of the component unmount process. Resource callbacks registered through `this.cleanup()` belong to the mount scope and are cleaned up by the mounting lifecycle.

---

## Root-Level Names

Method names occupy the component's root namespace alongside state and computed values.

Every root-level name must be unique.

For example, this is invalid:

```js
const Example = createComponent({
  name: "Example",

  state() {
    return {
      reset: false,
    };
  },

  methods: {
    reset() {
      this.reset = true;
    },
  },
});
```

Both the state and method attempt to claim the root name `reset`.

The same uniqueness rule applies across:

* state
* computed properties
* methods
* props

Props are checked per component instance because different instances can receive different prop sets.

Framework-reserved names also cannot be used as root-level user-defined names:

```text
name
state
computed
interceptors
methods
watch
template
onMount
onUnmount
refs
style
ud
```

For example:

```js
methods: {
  name() {
    // Invalid: "name" is reserved.
  },
},
```

Udodi validates these names and reports collisions with the component name and conflicting namespace.

---

## What Methods Are Not

### Not derived state

Do not use methods to represent values that should remain synchronized with reactive state.

Prefer:

```js
computed: {
  total(ctx) {
    return ctx.price * ctx.quantity;
  },
},
```

instead of using a method solely to calculate a derived value.

### Not reactive effects

Calling a method does not make it a reactive effect.

If behavior should run automatically when state changes, use a watcher.

### Not arbitrary template JavaScript

Methods are referenced through Udodi's template DSL:

```html
<button @on="click=increment">
```

rather than embedding arbitrary JavaScript expressions.

### Not a second state store

Methods contain behavior.

* Reactive values belong in `state`.
* Derived values belong in `computed`.
* State-change side effects belong in `watch`.
* Actions and reusable imperative logic belong in `methods`.

---

## Constraints

| Constraint           | Behavior                                                                   |
| -------------------- | -------------------------------------------------------------------------- |
| Function values      | Non-function entries under `methods` are skipped                           |
| Public context       | Methods execute with the public component context as `this`                |
| Root-level namespace | Method names cannot collide with state, computed values, or props          |
| Reserved names       | Framework-reserved root names cannot be used                               |
| State updates        | Root assignments go through the reactive state system and its interceptors |
| Reactivity           | Methods are not themselves reactive computations                           |
| Template access      | Methods can be referenced by name through the template DSL                 |
| Resolver access      | Methods can receive arguments resolved by directive syntax                 |
| Nested state         | In-place nested mutations may require `touch()` to notify dependents       |
| Async support        | Methods may be declared `async` and return promises                        |
| DOM access           | Registered refs are available through `this.refs`                          |
| Cleanup              | `this.cleanup(fn)` registers `fn` with the component's mount cleanup scope |
| Watch handlers       | Watch handlers receive `newValues` and `oldValues` objects keyed by `deps` |

---

## Minimal Example

```js
import { createComponent, html, render } from "udodi";

const Toggle = createComponent({
  name: "Toggle",

  state() {
    return {
      on: false,
    };
  },

  methods: {
    toggle() {
      this.on = !this.on;
    },
  },

  template: () => html`
    <button @on="click=toggle">
      <span @text="on"></span>
    </button>
  `,
});

render(Toggle(), "#app");
```

The method performs the state transition, while Udodi's reactive state system updates consumers of `on`.

---

## Next Steps

* [Components](./components.md) — component structure and root-level namespace rules
* [State](./state.md) — reactive state that methods can update
* [Computed Values](./computed.md) — derived values and automatic dependency tracking
* [Watchers](./watch.md) — responding to state changes with `newValues` and `oldValues`
* [Props](./props.md) — values supplied to component instances
* [Interceptors](./interceptors.md) — transforming or cancelling root state assignments
* [Context](./context.md) — the public component context
* [Templates](../templates/) — directive and method resolution
* [Using `touch()`](../reactivity/touch.md) — notifying after nested mutations
