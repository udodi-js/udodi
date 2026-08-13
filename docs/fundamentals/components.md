# Components

Components are the primary building blocks of an Udodi application.

A component combines **state, derived values, behavior, templates, styles, and lifecycle** into a reusable unit. Components can be composed into larger interfaces and can receive data through props.

A component is defined with `createComponent()`, instantiated through the returned factory, and mounted with `render()`.

```text
Component definition
        │
        │ createComponent()
        ▼
Component factory
        │
        │ Component(props)
        ▼
Component instance
        │
        │ render()
        ▼
       DOM
```

This guide explains the component model and how its parts fit together. Each individual capability is covered in more detail in the corresponding [Fundamentals](./) guide.

---

## Creating a Component

Use `createComponent()` to define a component:

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
    <main class="counter">
      <p>Count: <span @text="count"></span></p>
      <button @on="click=increment">+</button>
    </main>
  `,
});
```

A component definition describes the data, behavior, presentation, and lifecycle of a component.

### Component options

| Option         | Purpose                                                |
| -------------- | ------------------------------------------------------ |
| `name`         | Identifies the component in diagnostics and debugging. |
| `state`        | Defines instance-local reactive state.                 |
| `computed`     | Defines values derived from reactive state.            |
| `methods`      | Defines component behavior and event handlers.         |
| `watch`        | Responds to changes in reactive state.                 |
| `interceptors` | Transforms or cancels state assignments.               |
| `template`     | Defines the component's markup.                        |
| `style`        | Defines component-scoped CSS.                          |
| `onMount`      | Runs after the component is mounted.                   |
| `onUnmount`    | Runs when the component is being unmounted.            |

The component's `template` option must be provided, and other options are optional.

---

## Component Definition, Placeholder, and Instance

`createComponent()` creates a **component factory**. It does not immediately create a component instance or DOM element.

```js
const Counter = createComponent({
  // component definition
});
```

The returned factory is used to create a **component placeholder**:

```js
const placeholder = Counter();
```

The placeholder represents the component in the render tree. It is not the component instance itself.

When the placeholder is resolved during rendering, Udodi invokes the component factory internally to create the actual **component instance**. The instance contains the component's context, template, styles, lifecycle hooks, and other runtime state.

Conceptually:

```text
createComponent(...)
        │
        ▼
Component factory
        │
        │ Counter(props)
        ▼
Component placeholder
        │
        │ render / resolve
        ▼
Component instance
        │
        ▼
Mounted DOM
```

For example:

```js
const first = Counter();
const second = Counter();

render(first, "#first");
render(second, "#second");
```

`first` and `second` are component placeholders. When they are rendered, Udodi creates separate component instances for them.

Each resulting instance receives its own component state, context, reactive effects, and lifecycle.

This separation between **component definition**, **placeholder**, and **instance** allows components to participate in the render tree before their runtime instances are created.

---

## Component Options at a Glance

The options of a component serve different responsibilities:

```text
                    Component
                        │
        ┌───────────────┼───────────────┐
        │               │               │
       Data          Behavior      Presentation
        │               │               │
     state           methods         template
     computed        watch           style
        │            interceptors       │
        │               │               │
        └───────────────┼───────────────┘
                        │
                    Lifecycle
                        │
                 onMount/onUnmount
```

The individual options are intentionally documented separately:

* [State](./state.md) — reactive component state.
* [Computed Values](./computed.md) — derived reactive values.
* [Methods](./methods.md) — component behavior.
* [Watchers](./watch.md) — reacting to state changes.
* [Interceptors](./interceptors.md) — controlling state assignments.
* [Lifecycle](./lifecycle.md) — mounting and cleanup.
* [Props](./props.md) — component inputs and parent-child data flow.
* [Context](./context.md) — the component context exposed to user code.
* [Component Styles](./styles.md) — component-scoped CSS.

---

## Rendering a Component

Mount a component with `render()`:

```js
import { render } from "udodi";

render(Counter(), "#app");
```

Rendering resolves the component instance and mounts its template into the target.

A component template must produce **exactly one root element**.

```js
template: () => html`
  <main>
    ...
  </main>
`,
```

A template with multiple top-level elements is not a valid component template.

See [Templates](../templates/).

---

## Component Composition

Components can be composed by including one component's factory call inside another component's template.

```js
const Child = createComponent({
  name: "Child",

  template: () => html`
    <p>Child component</p>
  `,
});

const Parent = createComponent({
  name: "Parent",

  template: () => html`
    <section>
      <h1>Parent</h1>
      ${Child()}
    </section>
  `,
});

render(Parent(), "#app");
```

When the parent is rendered, Udodi resolves the child component and mounts it as part of the resulting component tree.

This allows applications to be constructed from smaller, independently defined components:

```text
Application
└── Page
    ├── Header
    ├── Content
    │   ├── Sidebar
    │   └── Main
    │       ├── Card
    │       └── Card
    └── Footer
```

Composition is the primary mechanism for building larger interfaces from smaller components.

---

## Passing Props

A component can receive props when its factory is called:

```js
const User = createComponent({
  name: "User",

  template: () => html`
    <p @text="userName"></p>
  `,
});

const Page = createComponent({
  template: () => html`
    <section>
      ${User({
        userName: "Attamah",
      })}
    </section>
  `,
});
```

Props become root-level names in the child component context.

This means prop names are subject to the same namespace rules as the child's `state`, `computed`, and `methods`.

### Prop names must be unique

A prop name **must not collide** with a name already defined by the child component.

For example:

```js
const User = createComponent({
  state() {
    return {
      label: "Unknown",
    };
  },
});

// ❌ "label" conflicts with User.state.label
User({
  label: "Ada",
});
```

A prop also cannot collide with a computed value or method:

```js
const User = createComponent({
  computed: {
    displayName(ctx) {
      return ctx.label;
    },
  },

  methods: {
    reset() {
      // ...
    },
  },
});

// ❌ "displayName" conflicts with User.computed.displayName
User({
  displayName: "Ada",
});

// ❌ "reset" conflicts with User.methods.reset
User({
  reset: true,
});
```

Multiple props must also have unique names.

### Reserved keywords

Props cannot use Udodi's reserved component keywords.

The reserved names are:

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
// ❌ "name" is a reserved component keyword
User({
  name: "Ada",
});

// ❌ "state" is a reserved component keyword
User({
  state: "value",
});
```

Udodi validates prop names when the child component instance is created. A collision results in an error identifying the component, prop, and namespace involved. The runtime uses an instance-specific copy of the component's defined-key registry so different instances can receive different, valid prop sets.

The result is a single, unambiguous root-level namespace:

```text
Child component context

state ────────┐
computed ─────┤
methods ──────┼──► unique root-level names
props ────────┘
```

See [Props](./props.md) for the complete prop model.

---

## Static and Reactive Props

Props are passed directly to the child component by default.

For primitive values, this follows JavaScript's normal value semantics:

```js
Child({
  count: 10,
  username: "Ada",
  active: true,
});
```

For objects, arrays, and functions, the reference is passed directly:

```js
const user = {
  name: "Ada",
};

Child({
  user,
});
```

The child receives the same `user` object reference. Udodi does not clone the object when passing the prop.

```text
Parent                         Child

user ────────────────────────► user
       same object reference
```

Therefore, reference identity is preserved:

```js
const user = {
  name: "Ada",
};

const child = render(Child({ user }), "#app");

// The child receives the same object.
child.context.user === user;
```

However, **passing a value by reference is not the same as creating a reactive prop binding**.

A normal prop does not establish a reactive dependency between the parent expression and the child prop.

### Reactive props

When the child needs a live reactive connection to a parent expression, use `bindProp()`:

```js
import { bindProp } from "udodi";

Child({
  user: bindProp(() => ctx.user),
});
```

With `bindProp()`, Udodi creates a reactive prop binding rather than storing the supplied value directly.

```text
Regular prop

Parent expression ───── value/reference ─────► Child prop


Reactive prop

Parent expression ── bindProp() ──► Child prop
       │                                 │
       └────── reactive updates ─────────┘
```

The distinction is:

* **Regular prop:** passes the supplied value directly. Objects retain their reference identity, but no reactive parent-to-child binding is created.
* **Reactive prop:** `bindProp()` explicitly connects the child prop to a reactive parent expression.

This distinction is particularly important for objects. An object can be shared by reference between parent and child without the child prop itself being a reactive binding.

Udodi's reactive state system is also shallow: top-level reactive properties are tracked, while nested objects are not automatically made independently reactive.

See [Props](./props.md) for the complete prop model.

---

## Component Context

Component code interacts with the component through its **public context**.

The public context provides controlled access to the component's capabilities, including:

* reactive state;
* computed values;
* methods;
* props;
* element references through `refs`;
* the component `name`;
* the `ud` framework namespace;
* lifecycle cleanup through `cleanup()`.

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
});
```

Methods use the public context as `this`:

```js
methods: {
  increment() {
    this.count++;
  },
},
```

Computed functions receive the public context as `ctx`:

```js
computed: {
  doubled(ctx) {
    return ctx.count * 2;
  },
},
```

Lifecycle hooks also receive the public context:

```js
onMount(root, ctx) {
  // ...
},
```

The public context is deliberately restricted. User code cannot append arbitrary root-level properties or overwrite reserved framework properties. The `ud` namespace exposed through the public context is read-only.

See [Context](./context.md).

---

## Component Lifecycle

A component progresses through a defined lifecycle:

```text
Create
  │
  ▼
Initialize
  │
  ▼
Mount
  │
  ▼
Active
  │
  ▼
Unmount
  │
  ▼
Cleanup
```

Components can participate in the lifecycle through `onMount` and `onUnmount`:

```js
const Example = createComponent({
  onMount(root, ctx) {
    // Component has been mounted.
  },

  onUnmount(root, ctx) {
    // Component is being unmounted.
  },
});
```

Use lifecycle hooks when component behavior needs to interact with the DOM or perform setup and cleanup work.

Cleanup callbacks can be registered through the component context:

```js
onMount(root, ctx) {
  const timer = setInterval(() => {
    // ...
  }, 1000);

  ctx.cleanup(() => {
    clearInterval(timer);
  });
},
```

See [Lifecycle](./lifecycle.md).

---

## Component Styles

Components can define styles through the `style` option:

```js
import { createComponent, css } from "udodi";

const Card = createComponent({
  style: css`
    .card {
      padding: 1rem;
    }
  `,
});
```

Component styles are scoped by Udodi so that styles defined by a component can remain isolated from unrelated application markup.

See [Component Styles](./styles.md) and [CSS Scoping](../advanced/css-scoping.md).

---

## Component State

State is defined with a function that returns the initial state object:

```js
const Counter = createComponent({
  state() {
    return {
      count: 0,
    };
  },
});
```

The state function must return an object.

```js
// ❌ Invalid
state: {
  count: 0,
}
```

```js
// ❌ Invalid
state() {
  return null;
}
```

Each component instance should receive a fresh state object. Reusing the same state object across instances causes Udodi to emit a warning.

Component state is **shallow-reactive**. Udodi tracks top-level state keys; nested objects are not automatically made deeply reactive.

```js
state() {
  return {
    user: {
      name: "Ada",
    },
  };
}
```

Updating a nested property in place does not automatically notify dependents:

```js
this.user.name = "Grace"; // no notification yet
```

Prefer `touch()` to notify after an in-place nested mutation. Pass the component context (or the reactive state proxy) and the root key that was mutated:

```js
import { touch } from "udodi";

this.user.name = "Grace";
touch(this, "user");
```

`touch()` fires the signal for that root key so computed values, watchers, and DOM bindings that depend on `user` update without replacing the object.

You can still replace the parent value when that is clearer:

```js
this.user = {
  ...this.user,
  name: "Grace",
};
```

Replacing the root key notifies automatically. Use `touch()` when you want to keep the same object reference and only signal that nested data changed.

See [State](./state.md).

---

## Root-Level Names

Udodi maintains a single namespace for the names exposed at the component root.

The following namespaces participate in that registry:

```text
state
computed
methods
props
```

Every name must be unique.

For example, this is invalid:

```js
const Example = createComponent({
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

The `title` computed property conflicts with `state.title`.

The same rule applies to methods and props.

```text
Component root namespace

┌───────────────────────────────┐
│             Context           │
├───────────────────────────────┤
│ state                         │
│ computed                      │
│ methods                       │
│ props                         │
└───────────────────────────────┘
              │
              ▼
       All names unique
```

Udodi validates component-defined keys when the component is created and validates props against those keys when an instance is created.

This prevents ambiguous context resolution and ensures that a root-level name always has a single meaning.

---

## Reserved Keywords

The following names are reserved by the component runtime:

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

These names cannot be used as root-level `state`, `computed`, `methods`, or `props` keys.

For example:

```js
const Example = createComponent({
  state() {
    return {
      // ❌ "refs" is a reserved framework keyword
      refs: {},
    };
  },
});
```

```js
const Example = createComponent({
  state() {
    return {
      // ❌ "name" is a reserved framework keyword
      name: "Ada",
    };
  },
});
```

Reserved names also cannot be overwritten through the public component context.

---

## Component Constraints

The component runtime enforces the following constraints:

| Constraint                                       | Behavior                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `state` must be a function                       | Throws `TypeError` otherwise.                                            |
| `state()` must return an object                  | Throws if it returns `null`, an array, or another non-object value.      |
| State should be fresh per instance               | Reusing the same state object produces a warning.                        |
| Root-level names must be unique                  | `state`, `computed`, `methods`, and `props` cannot define the same name. |
| Prop names must be unique                        | A prop cannot collide with another prop or an existing component name.   |
| Props cannot use reserved keywords               | Reserved component names cannot be passed as props.                      |
| Component output must have one root element      | A component template must resolve to exactly one root element.           |
| State reactivity is shallow                      | Nested objects are not automatically deeply reactive.                    |
| Regular props are snapshots                      | Use `bindProp()` for an explicit reactive connection.                    |
| Public context cannot be extended                | Arbitrary root-level properties cannot be appended.                      |
| Reserved context properties cannot be overridden | Framework-reserved properties are protected.                             |

---

## Minimal Example

The following is the smallest useful component pattern:

```js
import { createComponent, html, render } from "udodi";

const Hello = createComponent({
  name: "Hello",

  state() {
    return {
      label: "World",
    };
  },

  template: () => html`
    <p>
      Hello, <span @text="label"></span>
    </p>
  `,
});

render(Hello(), "#app");
```

> **Note:** `name` is a reserved keyword and cannot be used as a state, computed, method, or prop key. Use a different identifier such as `label`, `userName`, or `title`.

A component does not need to use every available option. Start with the smallest definition that expresses the component's responsibility and add state, behavior, lifecycle, props, or styles as required.

---

## Component Model

The complete component flow can be summarized as:

```text
                         createComponent()
                                │
                                ▼
                       Component definition
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
             Data            Behavior       Presentation
              │                 │                 │
            state            methods           template
            computed         watch             style
            props            interceptors
              │                 │                 │
              └─────────────────┼─────────────────┘
                                │
                                ▼
                       Component factory
                                │
                                │ Component(props)
                                ▼
                       Component instance
                                │
                                ▼
                             render()
                                │
                                ▼
                               DOM
                                │
                                ▼
                            Lifecycle
```

This is the core model to keep in mind when working with Udodi components.

---

## Next Steps

The Fundamentals section provides a focused guide for each component capability:

* [State](./state.md) — reactive component state.
* [Methods](./methods.md) — component behavior and event handlers.
* [Computed Values](./computed.md) — derived reactive values.
* [Watchers](./watch.md) — responding to reactive changes.
* [Interceptors](./interceptors.md) — controlling state assignments.
* [Lifecycle](./lifecycle.md) — mounting, unmounting, and cleanup.
* [Props](./props.md) — passing data and establishing reactive bindings.
* [Context](./context.md) — the public component context.
* [Component Styles](./styles.md) — component-scoped CSS.

For templates and directives, see [Templates](../templates/).

For advanced runtime concepts, see [Advanced](../advanced/).

For exact API signatures and runtime contracts, see the [API Reference](../api/).
