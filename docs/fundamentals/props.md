# Props

Props are values passed to a component when its factory is called. They become **root-level names on that component instance's public context**, alongside state, computed values, and methods.

By default, props are **static values** captured when the component instance is created. When a child needs to remain connected to a reactive value owned by its parent, use `bindProp()` to create a live prop binding.

Props are inputs to a component. They do not become child-owned state, and Udodi does not provide automatic two-way prop mutation.

---

## Passing Props

Pass props by calling the component factory with an object:

```js
import { createComponent, html, render } from "udodi";

const Greeter = createComponent({
  name: "Greeter",

  template: () => html`
    <p>Hello, <span @text="userName"></span></p>
  `,
});

const Page = createComponent({
  name: "Page",

  template: () => html`
    <section>
      ${Greeter({ userName: "Ada" })}
    </section>
  `,
});

render(Page(), "#app");
```

Inside `Greeter`, `userName` is a root-level context property.

It can be read from:

* Templates
* Methods
* Computed functions
* Watchers
* Lifecycle hooks

```js
const Profile = createComponent({
  name: "Profile",

  computed: {
    caption(ctx) {
      return `${ctx.userName} (${ctx.role})`;
    },
  },

  methods: {
    log() {
      console.log(this.userName, this.role);
    },
  },

  onMount(root, ctx) {
    console.log(ctx.userName);
  },

  template: () => html`
    <p @text="caption"></p>
  `,
});
```

There is no separate `props` namespace in the public context.

---

## Props and the Public Context

Props are installed on the component instance and exposed through the same public context membrane used for other root-level values.

```js
const UserCard = createComponent({
  name: "UserCard",

  template: () => html`
    <article>
      <h2 @text="name"></h2>
      <p @text="role"></p>
    </article>
  `,
});

UserCard({
  name: "Ada",
  role: "admin",
});
```

The child reads:

```js
this.name;
this.role;
```

or:

```js
ctx.name;
ctx.role;
```

depending on whether the code receives the public context as `this` or an explicit `ctx`.

The component does not need to know whether a root value came from `state`, `computed`, or `props`; the public context resolves the registered root key.

---

## Static Props

A normal prop is a **snapshot** of the value supplied when the component instance is created.

```js
const Child = createComponent({
  name: "Child",

  template: () => html`
    <p @text="userName"></p>
  `,
});

const Parent = createComponent({
  name: "Parent",

  state() {
    return {
      userName: "Ada",
    };
  },

  methods: {
    rename() {
      this.userName = "Grace";
    },
  },

  template: (ctx) => html`
    <section>
      ${Child({
        userName: ctx.userName,
      })}

      <button @on="click=rename">
        Rename
      </button>
    </section>
  `,
});
```

The child receives the value that `ctx.userName` had when `Child(...)` was called.

Changing the parent's state later does not automatically change the child's prop.

This distinction is important:

```text
Parent state
    │
    │ ordinary value
    ▼
Child prop
    │
    └── snapshot
```

Use a static prop when the child only needs the supplied value and does not need to track subsequent parent changes.

---

## Reactive Props with `bindProp()`

Use `bindProp()` when the child should remain connected to a reactive value owned by the parent.

```js
import { bindProp, createComponent, html, render } from "udodi";

const Child = createComponent({
  name: "Child",

  template: () => html`
    <p @text="userName"></p>
  `,
});

const Parent = createComponent({
  name: "Parent",

  state() {
    return {
      userName: "Ada",
    };
  },

  methods: {
    rename() {
      this.userName = "Grace";
    },
  },

  template: (ctx) => html`
    <section>
      ${Child({
        userName: bindProp(() => ctx.userName),
      })}

      <button @on="click=rename">
        Rename
      </button>
    </section>
  `,
});

render(Parent(), "#app");
```

When the parent changes `userName`, the child's `userName` prop reflects the new value.

The child does not own the value. It reads through the binding to the parent's reactive value.

```text
Static prop

Parent value ─────────► Child prop
                         snapshot


Reactive prop

Parent state ──► bindProp(() => ...)
      │                    │
      │                    ▼
      └──────────────► Child prop
                       live read
```

### How `bindProp()` Works

`bindProp()` creates a marked binding that tells the child runtime to expose the prop through a getter rather than storing a fixed value.

Conceptually:

```js
Child({
  userName: bindProp(() => ctx.userName),
});
```

behaves like a live read:

```js
childContext.userName
// evaluates the parent binding when read
```

This allows reactive reads performed by the child to remain connected to the parent's dependency.

For example, a child computed value can depend on a bound prop:

```js
const Child = createComponent({
  name: "Child",

  computed: {
    greeting(ctx) {
      return `Hello, ${ctx.userName}`;
    },
  },

  template: () => html`
    <p @text="greeting"></p>
  `,
});
```

When the parent changes the bound `userName`, the child's reactive reads can observe the updated value.

---

## Bound Props Are Read-Only from the Child

A bound prop represents a value owned by another component.

The child should therefore treat it as an input:

```js
const Child = createComponent({
  name: "Child",

  methods: {
    logUser() {
      console.log(this.userName);
    },
  },
});
```

The child should not use a bound prop as if it were child-owned state.

If the child needs to change its own value, put that value in `state()`:

```js
const Child = createComponent({
  name: "Child",

  state() {
    return {
      value: "",
    };
  },
});
```

If the parent needs to respond to a child action, use a callback prop or another explicit communication mechanism.

Udodi's prop model is therefore intentionally directional:

```text
Parent
  │
  │ prop / bindProp()
  ▼
Child

Child
  │
  │ callback / method / shared state
  ▼
Parent
```

---

## Static vs Reactive Props

Use the two forms for different purposes:

| Requirement                            | Approach                                     |
| -------------------------------------- | -------------------------------------------- |
| Initial label or configuration         | Static prop                                  |
| Fixed identifier                       | Static prop                                  |
| Callback function                      | Static prop                                  |
| Child must track parent state          | `bindProp(() => ctx.value)`                  |
| Child owns and changes the value       | Child `state()`                              |
| Parent needs to react to child actions | Callback prop or explicit parent interaction |
| Shared application state               | Shared store or other shared reactive state  |

A useful rule is:

> **Use a static prop for a value. Use `bindProp()` for a live parent-owned value. Use state for a child-owned value.**

---

## Callback Props

Functions can be passed as ordinary props.

```js
const Dialog = createComponent({
  name: "Dialog",

  methods: {
    confirm() {
      this.onConfirm?.(true);
    },

    cancel() {
      this.onConfirm?.(false);
    },
  },

  template: () => html`
    <div class="dialog">
      <button @on="click=confirm">Yes</button>
      <button @on="click=cancel">No</button>
    </div>
  `,
});
```

The parent can provide the callback:

```js
Dialog({
  onConfirm(result) {
    console.log("closed with", result);
  },
});
```

The callback is a normal prop value and therefore follows the normal static-prop behavior.

This is generally what you want for event-style callbacks.

---

## Live Callback Props

If the callback reference itself needs to remain connected to a changing parent value, it can be passed through `bindProp()`:

```js
Child({
  onChange: bindProp(() => ctx.currentHandler),
});
```

This is different from the usual callback-prop pattern:

```js
Child({
  onChange: ctx.currentHandler,
});
```

The first form provides a live binding. The second provides the function reference that exists when the child is created.

Most event-style callback props should simply be passed as ordinary props.

---

## Root-Level Name Uniqueness

Props participate in the component instance's root namespace.

A prop cannot collide with an existing:

* State key
* Computed key
* Method name
* Another prop
* Reserved component property

For example:

```js
const User = createComponent({
  name: "User",

  state() {
    return {
      label: "Unknown",
    };
  },
});

User({
  label: "Ada",
});
```

This is invalid because `label` already belongs to the component's state namespace.

Likewise:

```js
const User = createComponent({
  name: "User",

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
```

These are also invalid:

```js
User({
  displayName: "Ada",
});

User({
  reset: true,
});
```

The prop registry is checked for each component instance. This is important because props are supplied at instance creation rather than declared as fixed component-definition keys.

---

## Reserved Names

Props cannot use names reserved by the component runtime.

Examples include:

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
// ❌ Reserved component property
User({
  name: "Ada",
});
```

```js
// ❌ Reserved component property
User({
  state: {},
});
```

Use application-level names instead:

```js
User({
  userName: "Ada",
  title: "Administrator",
});
```

---

## Props in Templates

Props are referenced directly by their root-level names.

```html
<span @text="userName"></span>
<span @text="caption"></span>
<button @attr="disabled=locked">Save</button>
```

There is no separate `props.userName` syntax.

The template resolver looks up the root name through the component's public context.

This means state, computed values, methods, and props can all participate in the template's root-level lookup model.

---

## Props in Computed Values

Computed functions receive the public context and can derive values from props:

```js
const Profile = createComponent({
  name: "Profile",

  computed: {
    displayName(ctx) {
      return `${ctx.firstName} ${ctx.lastName}`;
    },
  },

  template: () => html`
    <p @text="displayName"></p>
  `,
});

Profile({
  firstName: "Ada",
  lastName: "Lovelace",
});
```

With a bound prop, the computed value can remain connected to the parent's reactive source:

```js
Profile({
  firstName: bindProp(() => ctx.firstName),
  lastName: bindProp(() => ctx.lastName),
});
```

The computed value then derives from the current values exposed by those bindings.

See [Computed Values](./computed.md).

---

## Props in Methods

Methods access props through `this`, just like other public context values:

```js
const Profile = createComponent({
  name: "Profile",

  methods: {
    logProfile() {
      console.log(this.userName);
      console.log(this.role);
    },
  },

  template: () => html`
    <button @on="click=logProfile">
      Log profile
    </button>
  `,
});
```

Props can also be used when performing an action:

```js
methods: {
  save() {
    api.save({
      userId: this.userId,
      value: this.value,
    });
  },
},
```

A method does not automatically make a prop reactive. If the prop is static, it remains the supplied snapshot. If it is created with `bindProp()`, reads remain connected to the parent's value.

See [Methods](./methods.md).

---

## Props in Lifecycle Hooks

Props are available through the public context in lifecycle hooks:

```js
const Profile = createComponent({
  name: "Profile",

  onMount(root, ctx) {
    console.log("Mounted profile for", ctx.userName);
  },

  onUnmount(root, ctx) {
    console.log("Unmounting profile for", ctx.userName);
  },

  template: () => html`
    <div class="profile"></div>
  `,
});
```

This makes props suitable for configuring resources initialized during `onMount`.

See [Lifecycle](./lifecycle.md).

---

## Props and Watchers

Watchers observe **top-level reactive state keys**. A prop is not automatically converted into a state signal simply because it appears on the public context.

For parent-owned values that need to remain reactive in the child, use `bindProp()` and consume that value through the child's reactive reads.

For example:

```js
const Child = createComponent({
  name: "Child",

  computed: {
    label(ctx) {
      return `User: ${ctx.userName}`;
    },
  },

  template: () => html`
    <p @text="label"></p>
  `,
});
```

with:

```js
Child({
  userName: bindProp(() => ctx.userName),
});
```

Use [Watchers](./watch.md) for side effects and [Computed Values](./computed.md) for derived values.

---

## Props and Nested Values

Props follow the same shallow/reactive model as the values they expose.

A static object prop is simply the supplied object reference:

```js
Child({
  user: {
    name: "Ada",
  },
});
```

The child receives that object value, but the prop itself does not become a deep reactive state tree.

If a parent-owned object is passed with `bindProp()`:

```js
Child({
  user: bindProp(() => ctx.user),
});
```

the child reads the current parent value through the binding.

For nested parent state, follow the normal shallow reactivity rules of the owning state. In-place nested mutations may require `touch()` on the parent's root state key.

See [State](./state.md) and [Using `touch()`](../reactivity/touch.md).

---

## Composition Example

The following example demonstrates both forms of props:

```js
import {
  bindProp,
  createComponent,
  html,
  render,
} from "udodi";

const Badge = createComponent({
  name: "Badge",

  template: () => html`
    <span class="badge" @text="label"></span>
  `,
});

const UserCard = createComponent({
  name: "UserCard",

  template: () => html`
    <article class="card">
      <h2 @text="userName"></h2>
      ${Badge({
        label: "Member",
      })}
    </article>
  `,
});

const App = createComponent({
  name: "App",

  state() {
    return {
      userName: "Ada",
    };
  },

  methods: {
    rename() {
      this.userName = "Grace";
    },
  },

  template: (ctx) => html`
    <main>
      ${UserCard({
        userName: bindProp(() => ctx.userName),
      })}

      <button @on="click=rename">
        Rename
      </button>
    </main>
  `,
});

render(App(), "#app");
```

Here:

* `Badge` receives a static `label`.
* `UserCard` receives a live `userName` binding.
* `App` owns the `userName` state.
* `UserCard` reads the parent's current `userName`.
* `UserCard` does not own or replace the parent's state.

---

## What Props Are Not

Props are **not**:

* Child-owned state
* Automatically two-way bindings
* Deeply reactive objects
* A separate `props` namespace
* A replacement for computed values
* A replacement for shared application state

Instead:

```text
state
  └─ owned by the current component

static prop
  └─ supplied value / snapshot

bindProp()
  └─ live read of a parent-owned value

computed
  └─ derived value

method / callback
  └─ explicit behavior or communication
```

This separation keeps ownership explicit.

---

## Static Props vs `bindProp()`

The distinction can be summarized as follows:

|                     | Static prop                      | `bindProp()`                   |
| ------------------- | -------------------------------- | ------------------------------ |
| Value captured      | At child creation                | Read when accessed             |
| Parent updates      | Not reflected                    | Reflected                      |
| Ownership           | Supplied by parent               | Remains with parent            |
| Child read          | Direct prop value                | Binding getter                 |
| Reactive connection | No                               | Yes                            |
| Child writes        | Not child-owned state            | Should be treated as read-only |
| Typical use         | Labels, configuration, callbacks | Live parent state              |

---

## Constraints

| Constraint                   | Behavior                                                               |
| ---------------------------- | ---------------------------------------------------------------------- |
| Root-level props             | Props are exposed directly on the public context                       |
| Unique root names            | Props cannot collide with state, computed, methods, or other props     |
| Reserved names               | Framework-reserved context names cannot be used                        |
| Static by default            | Ordinary props are snapshots                                           |
| `bindProp()` is live         | Bound props read through to the parent value                           |
| Parent owns bound values     | A bound prop is not child-owned state                                  |
| No automatic two-way binding | Child-to-parent communication is explicit                              |
| Shallow semantics            | Nested objects follow the underlying reactive state's shallow behavior |
| Instance-specific validation | Props are validated when the component instance is created             |

---

## Minimal Example

```js
import { createComponent, html, render } from "udodi";

const Hello = createComponent({
  name: "Hello",

  template: () => html`
    <p>
      Hello, <span @text="label"></span>
    </p>
  `,
});

render(
  Hello({
    label: "World",
  }),
  "#app"
);
```

For a fixed value, a normal prop is sufficient.

For a value that must remain connected to parent state, use:

```js
Hello({
  label: bindProp(() => ctx.label),
});
```

---

## Next Steps

* [Components](./components.md) — component creation and composition
* [State](./state.md) — component-owned reactive state
* [Methods](./methods.md) — reading props and callback props
* [Computed Values](./computed.md) — deriving values from props and state
* [Watchers](./watch.md) — reacting to reactive dependencies
* [Lifecycle](./lifecycle.md) — using props during mount and unmount
* [Context](./context.md) — the public context membrane
* [Reactivity Overview](../reactivity/overview.md) — reactive values and bindings
* [Using `touch()`](../reactivity/touch.md) — notifying after nested mutations
