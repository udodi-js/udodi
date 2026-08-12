# Context

Every mounted component exposes a public context through `instance.context`. The public context is the controlled API used by component code: methods, computed functions, watchers, lifecycle hooks, and function templates.

Internally, Udodi also maintains an **internal context** used by the runtime and template VM. The internal context is not the public component API.

The two surfaces are connected by a Proxy membrane:

```text
                         Component
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
      Internal context            Public context membrane
              │                           │
              │                           ├── state
              │                           ├── computed
              │                           ├── methods
              │                           ├── props
              │                           ├── refs
              │                           ├── ud
              │                           ├── name
              │                           └── cleanup
              │
              ▼                           ▼
       Runtime / VM                Component application code
       / bindDOM
```

`createComponent()` creates both contexts. `mount()` uses the internal context for runtime DOM binding and exposes the public context as the mounted instance's `context`.

---

## Public Context

The public context is the component-facing API.

When a component is mounted:

```js
const instance = mount(Component(), "#app");

instance.context;
```

`instance.context` is the public context membrane.

This means component code and external code holding a mounted instance interact with the same controlled context surface.

```js
instance.context.count = 10;
console.log(instance.context.count);
```

State writes through `instance.context` follow the same public-context rules as writes made through `this` inside a method.

---

## Internal Context

The internal context is the runtime-facing context created by `createComponent()`.

It contains the concrete runtime wiring needed by Udodi's VM and DOM binding system, including:

- component name
- standard-library helpers
- `refs`
- framework namespace
- reactive state access
- computed accessors
- methods
- props
- runtime lifecycle wiring

The internal context is passed to runtime systems such as `bindDOM()`.

Application code should normally use the public context instead.

| Context | Purpose |
| ------- | ------- |
| Public context | Component/application API |
| Internal context | Runtime and VM implementation surface |

---

## How Context Is Exposed

The same public context is made available through several component APIs.

| Location | Context access |
| -------- | -------------- |
| methods | `this` |
| computed | First argument `ctx` |
| watch handlers | `this` |
| `onMount` | Second argument `ctx` |
| `onUnmount` | Second argument `ctx` |
| Function templates | Template `ctx` |
| Mounted instance | `instance.context` |

For example:

```js
const Counter = createComponent({
  name: "Counter",

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

  methods: {
    increment() {
      this.count++;
    },
  },

  watch: {
    countChange: {
      deps: ["count"],

      handler(newValues, oldValues) {
        console.log(this.count);
      },
    },
  },

  onMount(root, ctx) {
    console.log(ctx.count);
  },

  onUnmount(root, ctx) {
    console.log(ctx.count);
  },

  template: (ctx) => html`
    <button @on="click=increment">
      <span @text="count"></span>
      /
      <span @text="doubled"></span>
    </button>
  `,
});
```

All of these component-facing APIs operate on the public context.

---

## Mounted Instance Context

`mount()` returns a mounted instance containing:

```js
const instance = mount(Component(), "#app");

instance.name;
instance.context;
instance.unmount();
```

The important distinction is:

```text
instance.context
      │
      ▼
public context membrane
      │
      ▼
internal reactive state / component definitions
```

`instance.context` is not a free-form object. Its Proxy traps control what can be read and written.

This means:

```js
instance.context.count = 10;
```

is a valid state write, while:

```js
instance.context.someUnknownKey = true;
```

is rejected.

---

## What the Public Context Exposes

The public context provides the following root-level surfaces:

| Kind | Access |
| ---- | ------ |
| Component name | `ctx.name` |
| State | Read and write registered state keys |
| Computed | Read computed properties |
| Methods | Call methods |
| Props | Read props |
| `refs` | Read DOM references |
| `ud` | Read framework-owned namespace |
| `cleanup` | Register unmount cleanup |

The public membrane controls these values rather than exposing the internal context directly.

---

## Reading from Context

Root property resolution follows the component's registered namespaces.

Conceptually:

```text
context key
    │
    ├── special runtime key
    │      ├── refs
    │      ├── ud
    │      ├── name
    │      └── cleanup
    │
    ├── state key
    │      └── reactive state store
    │
    ├── computed key
    │      └── computed value
    │
    ├── method key
    │      └── bound method
    │
    ├── prop key
    │      └── prop value / reactive prop
    │
    └── unknown key
           └── undefined
```

The exact precedence is implemented by the public context membrane.

Unknown properties are not dynamically appended to the component context.

---

## State

Component state is the normal writable portion of the public context.

```js
const Counter = createComponent({
  state() {
    return {
      count: 0,
      label: "Count",
    };
  },

  methods: {
    increment() {
      this.count++;
    },
  },
});
```

The state keys are available directly:

```js
this.count;
this.label;
```

and can be written:

```js
this.count = 10;
this.label = "Total";
```

The assignment goes through the component's reactive state store and therefore participates in the component's normal reactivity and interceptor processing.

### Shallow state reactivity

Component state is reactive at the top level.

For:

```js
state() {
  return {
    user: {
      label: "Ada",
    },
  };
}
```

the root key `user` is tracked as a state property.

Nested objects are not automatically made deeply reactive by the component state layer. Mutating:

```js
this.user.label = "Grace";
```

does not itself constitute a root-state assignment.

When a nested mutation needs to be surfaced to the component's reactivity system, use the appropriate reactivity mechanism, such as `touch()`.

---

## Computed Values

Computed values are exposed as readable properties on the public context.

```js
computed: {
  doubled(ctx) {
    return ctx.count * 2;
  },
},
```

The value is then read as:

```js
this.doubled;
```

or:

```js
ctx.doubled;
```

A computed property is not a writable state key:

```js
this.doubled = 10; // throws
```

Computed functions receive the public context as their first argument:

```js
computed: {
  total(ctx) {
    return ctx.price * ctx.quantity;
  },
},
```

This keeps computed functions on the same controlled context surface as methods and lifecycle hooks.

---

## Methods

Methods are exposed as callable root properties.

```js
methods: {
  increment() {
    this.count++;
  },

  reset() {
    this.count = 0;
  },
},
```

Inside a method, `this` is the public context:

```js
this.increment();
this.count++;
```

Methods cannot be replaced through the public context:

```js
this.increment = null; // throws
```

The runtime binds methods to the public context so method code does not receive the unrestricted internal context as `this`.

---

## Props

Props share the component's root namespace with state, computed properties, and methods.

A regular prop is exposed as its value.

```js
const User = createComponent({
  methods: {
    printName() {
      console.log(this.userName);
    },
  },
});
```

Reactive props can retain a live connection when created with `bindProp()`.

```js
Child({
  data: bindProp(() => parent.data),
});
```

Without `bindProp()`, a normal prop is a value passed to the child rather than an automatically connected reactive reference.

Props are readable through the public context but are not writable through normal public-context assignment. Public root assignment is reserved for registered state keys.

See [Props](./props.md).

---

## `refs`

`refs` contains DOM references registered by the template runtime.

```html
<input @ref="query" />
```

The reference is then available through:

```js
this.refs.query;
```

For example:

```js
methods: {
  focusQuery() {
    this.refs.query?.focus();
  },
},
```

Use refs for imperative DOM operations such as:

- focus
- scroll
- measurement
- direct browser API access

Prefer declarative bindings where possible.

`refs` is a runtime-managed object and is not part of the component's state namespace.

---

## `ud`

`ud` is Udodi's framework-owned namespace.

It is used internally by framework features and directives. For example, framework-managed form state can be exposed under the namespace:

```js
this.ud.forms;
```

The public context exposes `ud` through a readonly membrane.

Therefore:

```js
this.ud = {};
```

and mutations through the readonly surface are not valid application operations.

Treat `ud` as runtime-owned.

Application state should live in:

- component state
- props
- the Udodi Store

rather than inside `ud`.

---

## Standard Library Helpers

The internal context includes Udodi's standard-library helpers.

These helpers can be resolved by the runtime as context names when they are not shadowed by component-defined keys.

Common helpers include:

| Helper | Purpose |
| ------ | ------- |
| `trim(value)` | Trim a string; nullish values become `""` |
| `get(collection, key)` | Read from supported collections |
| `upper` | Upper-case conversion |
| `lower` | Lower-case conversion |
| `capitalise(value)` | Capitalize words |
| `size(collection)` | Get the size of a supported collection |
| `negate` / `n` | Boolean negation |

They are intended for lightweight formatting and value manipulation, particularly in template resolution.

Component root keys take precedence where they overlap with available helper names.

---

## `cleanup`

Mounted components expose a cleanup registrar through the public context.

```js
onMount(root, ctx) {
  const onResize = () => {
    // ...
  };

  window.addEventListener("resize", onResize);

  ctx.cleanup(() => {
    window.removeEventListener("resize", onResize);
  });
},
```

The cleanup hook is injected by the mounting system after the component is mounted.

Cleanup callbacks run during unmount along with the component's other runtime cleanup.

`cleanup` is therefore lifecycle infrastructure rather than ordinary component state.

Before mount, the cleanup hook has not yet been injected.

See [Lifecycle](./lifecycle.md).

---

## `touch()` and Context

`touch()` can accept a component's public context.

```js
import { touch } from "udodi";

methods: {
  rename(next) {
    this.user.label = next;
    touch(this, "user");
  },
},
```

This allows a nested mutation to explicitly notify the reactive system that the corresponding root state key should be considered changed.

The public context can therefore be used directly with `touch()`; application code does not need to access the component's internal runtime context.

See [Using `touch()`](../reactivity/touch.md).

---

## Watchers

Watchers declare dependencies on root state keys.

```js
watch: {
  userChanged: {
    deps: ["user"],

    handler(newValues, oldValues) {
      console.log(this.user);
    },
  },
},
```

Watcher handlers use the public context as `this`.

The watcher system tracks declared dependencies and invokes the handler when the relevant values change.

Because component state is shallow at the root, nested mutations are not independently represented as root dependency changes. Use `touch()` when a nested mutation needs to trigger the corresponding root-level dependency.

See [Watchers](./watch.md).

---

## Lifecycle Hooks

Lifecycle hooks receive the public context.

### `onMount`

```js
onMount(root, ctx) {
  console.log(ctx.name);
  console.log(ctx.count);

  ctx.cleanup(() => {
    // teardown
  });
},
```

### `onUnmount`

```js
onUnmount(root, ctx) {
  console.log(ctx.name);
},
```

The runtime invokes the component lifecycle machinery and supplies the public context to the user-defined hooks.

See [Lifecycle](./lifecycle.md).

---

## Templates and Context

Function templates receive the public context:

```js
template: (ctx) => html`
  <button @on="click=increment">
    <span @text="count"></span>
    <span @text="doubled"></span>
  </button>
`,
```

This means the function template can access the same component-facing properties as methods and lifecycle hooks:

```js
ctx.count;
ctx.doubled;
ctx.increment;
ctx.refs;
ctx.name;
```

The template runtime itself operates against the internal context when binding and evaluating the compiled template.

This distinction lets the template system access runtime metadata and wiring without making that implementation surface the public component API.

---

## Public Context Writes

The public context has a restrictive set operation.

### Valid state writes

```js
this.count = 1;
this.count++;
this.user = nextUser;
```

These are valid when `count` and `user` are registered state keys.

### Invalid computed writes

```js
this.doubled = 10;
```

Computed values are read-only.

### Invalid method writes

```js
this.increment = null;
```

Methods cannot be replaced through the public context.

### Invalid prop writes

```js
this.title = "New";
```

If `title` is a prop rather than state, the public context does not treat it as a writable root state key.

### Invalid arbitrary writes

```js
this.extra = true;
```

The public context is not an extensible application object. Unknown root keys cannot be appended.

### Invalid reserved writes

```js
this.name = "Other";
this.ud = {};
```

Reserved and framework-owned properties cannot be overwritten.

---

## Reserved Keywords

The following names are reserved by the component model:

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

These names cannot be registered as component state, computed properties, methods, or props.

For example:

```js
createComponent({
  state() {
    return {
      name: "Invalid",
    };
  },
});
```

throws a collision error.

The same rule prevents component definitions from accidentally replacing framework-level component properties.

---

## Namespace Collision Model

The component root namespace is shared by:

```text
state | computed | methods | props
```

A root key must have exactly one owner.

This is invalid:

```js
createComponent({
  state() {
    return {
      title: "Hello",
    };
  },

  computed: {
    title(ctx) {
      return ctx.title;
    },
  },
});
```

The component definition throws a namespace-collision error.

Props are also checked against the existing component namespace when an instance is created.

The invariant is:

> Every root-level component key has exactly one meaning.

That makes template resolution and component code predictable:

```js
ctx.title;
```

cannot ambiguously mean state in one place and computed data in another.

---

## Runtime Context vs Public Context

The distinction matters most at the DOM/runtime boundary.

`mount()` uses the internal context when it connects the component to the DOM runtime.

Conceptually:

```text
mount()
  │
  ├── internal context
  │       │
  │       └── bindDOM / VM
  │
  └── public context
          │
          └── instance.context
```

Therefore:

```js
instance.context
```

is the public context, while the context supplied internally to runtime DOM binding is the internal context.

Application code should not depend on the internal runtime context.

---

## Context Lifecycle

The context exists as part of the component instance, while some runtime facilities are injected during mounting.

The lifecycle is conceptually:

```text
createComponent()
      │
      ├── create state
      ├── create internal context
      ├── create public membrane
      ├── register computed
      ├── register methods
      ├── register watchers
      └── return component
                │
                ▼
              mount()
                │
                ├── bind runtime DOM using internal context
                ├── inject cleanup registrar
                └── return mounted instance
                         │
                         └── instance.context
                                │
                                ▼
                         public context
```

The public context is therefore the stable component-facing surface, while mount-time facilities such as `cleanup` become available as the component enters the mounted lifecycle.

---

## Context and Reactivity

The context is not itself the source of reactivity.

The reactive state store is.

The public context provides the controlled access path to that store:

```text
this.count
    │
    ▼
public context membrane
    │
    ▼
state accessor
    │
    ▼
reactive state store
```

A state assignment therefore participates in the normal component reactivity system:

```js
this.count = 10;
```

For nested state:

```js
this.user.label = "Grace";
```

the component's state model remains shallow. If the nested mutation needs to be surfaced explicitly, use `touch()` or replace the root value.

For example:

```js
this.user = {
  ...this.user,
  label: "Grace",
};
```

or:

```js
this.user.label = "Grace";
touch(this, "user");
```

---

## Context API Summary

| Property | Read | Write | Notes |
| -------- | ---- | ----- | ----- |
| `name` | Yes | No | Component name |
| State keys | Yes | Yes | Normal writable context |
| Computed keys | Yes | No | Evaluated computed values |
| Method keys | Yes | No | Callable methods |
| Prop keys | Yes | No | Values or reactive prop bindings |
| `refs` | Yes | Runtime-managed | DOM references |
| `ud` | Yes | No | Readonly framework namespace |
| `cleanup` | Yes, after mount | No | Cleanup registrar |
| Unknown keys | `undefined` | No | Cannot append to context |

---

## Minimal Example

```js
import { createComponent, html, mount } from "udodi";

const Counter = createComponent({
  name: "Counter",

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

  methods: {
    increment() {
      this.count++;
    },
  },

  onMount(root, ctx) {
    console.log(ctx.name);
    console.log(ctx.count);
    console.log(ctx.doubled);

    ctx.cleanup(() => {
      // teardown
    });
  },

  template: (ctx) => html`
    <button @on="click=increment">
      <span @text="count"></span>
      /
      <span @text="doubled"></span>
    </button>
  `,
});

const instance = mount(Counter(), "#app");

console.log(instance.name);
console.log(instance.context.count);

instance.context.count = 10;
```

The important distinction is:

```js
this.count;                 // inside methods
ctx.count;                  // computed, lifecycle, function templates
instance.context.count;     // mounted instance
```

all address the public context.

---

## Design Invariants

The component context maintains these invariants:

1. The public context is a Proxy membrane.
2. `instance.context` is the public context.
3. The internal context is used by runtime systems such as the VM and DOM binding.
4. State keys are the normal writable root properties.
5. Computed values are readable but not writable.
6. Methods are callable but not replaceable through the public context.
7. Props share the root namespace with state, computed values, and methods.
8. Root namespace collisions are rejected.
9. Reserved framework names cannot be registered as component keys.
10. `ud` is framework-owned and readonly through the public context.
11. `cleanup` becomes available through the public context after mount injects the cleanup registrar.
12. Component state is shallowly reactive at the top level.
13. Unknown root properties cannot be appended to the public context.
14. Component-facing callbacks receive the public context rather than the unrestricted internal context.
15. The internal context remains a runtime implementation surface and should not be treated as application API.

---

## Related Documentation

* [Components](./components.md) — component definitions and mounted instances
* [State](./state.md) — component state and reactivity
* [Methods](./methods.md) — methods and `this`
* [Computed Values](./computed.md) — computed functions and `ctx`
* [Props](./props.md) — component inputs and `bindProp()`
* [Lifecycle](./lifecycle.md) — mounting, unmounting, and cleanup
* [Watchers](./watch.md) — state dependency watchers
* [Using `touch()`](../reactivity/touch.md) — surfacing nested state changes
* [Udodi Store](../store/) — application-level shared state
