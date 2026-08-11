# State

Component state is the reactive data owned by a single component instance.

Udodi tracks state at the **top level only** (shallow reactivity). Top-level keys participate in the reactive system; nested objects and arrays are not automatically deeply proxied.

State is defined with the `state` option on `createComponent()`, exposed on the public component context, and updated from methods, interceptors, lifecycle hooks, and two-way bindings such as `@bind`.

---

## Defining State

`state` must be a **function** that returns a plain object:

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

The function is called once per instance so each component receives its own state object.

### Invalid definitions

```js
// ❌ Not a function
state: {
  count: 0,
}
```

```js
// ❌ Does not return an object
state() {
  return null;
}
```

```js
// ❌ Array is not a valid state root
state() {
  return [1, 2, 3];
}
```

Udodi throws a `TypeError` when `state` is not a function or when `state()` does not return a plain object.

### Fresh state per instance

Always return a **new** object:

```js
state() {
  return {
    count: 0,
  };
}
```

If `state()` returns the same object reference for multiple instances, Udodi emits a warning. Shared state objects cause instances to interfere with each other.

---

## Reading and Writing State

State keys are exposed as root-level properties on the public component context.

### In methods

Methods are bound so that `this` is the public context:

```js
methods: {
  increment() {
    this.count++;
  },

  setStep(value) {
    this.step = value;
  },
},
```

### In computed functions

Computed functions receive the public context as `ctx`:

```js
computed: {
  doubled(ctx) {
    return ctx.count * 2;
  },
},
```

### In lifecycle hooks

```js
onMount(root, ctx) {
  console.log(ctx.count);
},
```

### In templates

Directives read state by path:

```html
<span @text="count"></span>
<span @text="user.name"></span>
<input @bind="count" />
```

Nested paths such as `user.name` are valid for **reading**. Writing through nested paths is handled by the binding system (for example `@bind`) or by your methods.

---

## Shallow Reactivity

Only **top-level** state keys are reactive.

```js
state() {
  return {
    count: 0,
    user: {
      name: "Ada",
    },
  };
}
```

| Update | Notifies dependents? |
| ------ | -------------------- |
| `this.count++` | Yes |
| `this.user = { name: "Grace" }` | Yes |
| `this.user.name = "Grace"` | No (until you notify) |

Assigning a new value to a top-level key notifies computed values, watchers, and DOM bindings that depend on that key.

Mutating a nested field in place does **not** notify by itself.

---

## Nested Updates and `touch()`

When you mutate nested data in place, call `touch()` to notify dependents of the root key:

```js
import { createComponent, touch, html } from "udodi";

const Profile = createComponent({
  name: "Profile",

  state() {
    return {
      user: {
        name: "Ada",
        role: "admin",
      },
    };
  },

  methods: {
    rename(nextName) {
      this.user.name = nextName;
      touch(this, "user");
    },
  },

  template: () => html`
    <p @text="user.name"></p>
  `,
});
```

`touch(proxy, key)`:

- Accepts the component context (`this` / `ctx`) or the underlying reactive proxy
- Takes the **root** property name that was mutated
- Returns `true` if a trigger was found and fired

Prefer `touch()` when you want to keep the same object reference and only signal that nested data changed.

### Alternative: replace the root value

Replacing the top-level property notifies automatically:

```js
methods: {
  rename(nextName) {
    this.user = {
      ...this.user,
      name: nextName,
    };
  },
},
```

Use replacement when creating a new object is clearer or when you need a new reference. Use `touch()` when in-place mutation is preferable.

See [Using `touch()`](../reactivity/touch.md).

---

## State and Interceptors

Interceptors run **before** a root state assignment is committed. They can transform the value or cancel the write by returning `undefined`:

```js
const Form = createComponent({
  name: "Form",

  state() {
    return {
      count: 0,
      coupon: "",
    };
  },

  interceptors: {
    count(value) {
      return Math.max(0, value);
    },

    coupon(value) {
      return String(value).toUpperCase();
    },
  },

  methods: {
    decrement() {
      this.count--; // interceptor clamps to ≥ 0
    },
  },
});
```

Interceptors apply only to **root** assignments (`this.count = …`). Nested in-place mutations do not go through interceptors unless you assign a new root value.

See [Interceptors](./interceptors.md).

---

## State, Computed Values, and Watchers

### Computed values

Computed functions derive values from state and re-run when their reactive dependencies change:

```js
computed: {
  doubled(ctx) {
    return ctx.count * 2;
  },
},
```

If a computed reads a nested field, it still depends on the **root** key for notification. After a nested mutation, call `touch(this, "user")` (or replace `user`) so the computed updates.

See [Computed Values](./computed.md).

### Watchers

Watchers observe top-level state keys:

```js
watch: {
  countChange: {
    deps: ["count"],
    handler(newValues, oldValues) {
      console.log(oldValues.count, "→", newValues.count);
    },
  },
},
```

Only first-level keys listed in `deps` are tracked. Nested mutations notify a watcher only after the corresponding root key is updated or touched.

See [Watchers](./watch.md).

---

## Root-Level Names

State keys share a single root namespace with `computed`, `methods`, and `props`.

Every root-level name must be unique:

```js
// ❌ "title" is declared in both state and computed
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

State keys also cannot use reserved keywords:

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

```js
// ❌ "name" is reserved
state() {
  return {
    name: "Ada",
  };
}
```

```js
// ✅ Use a non-reserved key
state() {
  return {
    label: "Ada",
  };
}
```

Udodi validates component-defined keys when the component is created. Collisions throw an error that identifies the component, key, and namespace.

See [Components](./components.md) for the full namespace model.

---

## State and Templates

Templates read state through directives:

```html
<span @text="count"></span>
<span @text="user.name"></span>
<input @bind="count" />
<input @bind="user.name" />
```

- `@text`, `@show`, `@if`, `@class`, `@style`, and `@attr` read reactive values and update when dependencies change.
- `@bind` provides two-way binding. For nested paths such as `user.name`, the binding system updates the nested value and uses touch() to ensure the change participates in reactivity.

Directive expressions use Udodi's template DSL (paths, resolvers, literals) rather than arbitrary JavaScript.

See [Templates](../templates/).

---

## Instance Isolation

Each component instance owns its state:

```js
const Counter = createComponent({
  state() {
    return { count: 0 };
  },
  // ...
});

render(Counter(), "#first");
render(Counter(), "#second");
```

Updates in one instance do not affect the other. Isolation comes from calling `state()` per instance and returning a fresh object each time.

Shared application state belongs in [Udodi Store](../store/), not in a reused component state object.

---

## Constraints

| Constraint | Behavior |
| ---------- | -------- |
| `state` must be a function | Throws `TypeError` otherwise |
| `state()` must return a plain object | Throws if it returns `null`, an array, or a non-object |
| Fresh object per instance | Reusing the same object warns |
| Unique root keys | Cannot collide with `computed`, `methods`, or `props` |
| No reserved keywords | Reserved names cannot be state keys |
| Shallow reactivity | Only top-level keys are tracked automatically |
| Nested in-place mutation | Call `touch(ctx, key)` or replace the root value to notify |

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

---

## Next Steps

* [Components](./components.md) — the component model and namespace rules  
* [Computed Values](./computed.md) — values derived from state  
* [Methods](./methods.md) — updating state from component behavior  
* [Watchers](./watch.md) — reacting to state changes  
* [Interceptors](./interceptors.md) — transforming or canceling state writes  
* [Props](./props.md) — inputs and live bindings from parent state  
* [Using `touch()`](../reactivity/touch.md) — notifying after nested mutations  
* [Reactivity Overview](../reactivity/overview.md) — signals, effects, and reactive objects  
