# State

Component state is the reactive data owned by a single component instance.

Udodi's state reactivity is **shallow at the root-property level**. Each top-level state key participates in the reactive system. Ordinary nested objects are not automatically made deeply reactive.

Supported collections such as **arrays, `Map`, and `Set`** receive reactive wrappers when stored as state. Their structural mutation methods automatically notify the owning root state key, while objects contained inside those collections remain non-reactive unless they are replaced or the root key is explicitly notified with `touch()`.

State is defined with the `state` option of `createComponent()`, exposed on the public component context, and updated from methods, interceptors, lifecycle hooks, and two-way bindings such as `@bind`.

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

The function is called for each component instance, so each instance receives its own state object.

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

Nested paths such as `user.name` are valid for reading. Writing through nested paths is handled by the binding system (for example, `@bind`) or by your methods.

---

## Shallow Reactivity

Udodi tracks **top-level state keys**.

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

Mutating a nested field in an ordinary object in place does **not** notify by itself.

Collections are the important exception: arrays, `Map`, and `Set` have reactive structural mutation methods described below.

---

## Nested Updates and `touch()`

When you mutate nested data in an ordinary object in place, call `touch()` to notify dependents of the root key:

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

- accepts the component context (`this` / `ctx`) or the underlying reactive proxy;
- takes the **root** property name that was mutated;
- returns `true` if a trigger was found and fired.

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

## Reactive Collections

Udodi provides reactive wrappers for **arrays, `Map`, and `Set`** used as state values.

These collections are still shallow with respect to the values they contain, but their supported structural mutation methods automatically notify dependents of the owning root state key.

You do **not** need to call `touch()` after one of these supported collection mutations.

---

### Reactive Arrays

Arrays stored in state are automatically wrapped. Structural mutation methods notify dependents of the root state key.

```js
state() {
  return {
    items: [],
  };
},

methods: {
  addItem(item) {
    this.items.push(item);
  },

  removeLastItem() {
    this.items.pop();
  },

  replaceItem(index, item) {
    this.items.splice(index, 1, item);
  },
},
```

The following array mutation methods are reactive:

- `push()`
- `pop()`
- `shift()`
- `unshift()`
- `splice()`
- `sort()`
- `reverse()`
- `fill()`
- `copyWithin()`

For example:

```js
this.items.push("Apple");
```

automatically notifies dependents of `items`.

Do not add an unnecessary `touch()`:

```js
this.items.push("Apple");
touch(this, "items"); // unnecessary
```

The collection wrapper already triggers the root state signal.

#### Array contents are not deeply reactive

Objects stored inside an array are not recursively proxied:

```js
state() {
  return {
    users: [
      { name: "Ada" },
    ],
  };
},
```

This does not automatically notify dependents:

```js
this.users[0].name = "Grace";
```

Notify the root key explicitly:

```js
this.users[0].name = "Grace";
touch(this, "users");
```

Or replace the item through a reactive array mutation:

```js
this.users.splice(0, 1, {
  ...this.users[0],
  name: "Grace",
});
```

The second approach automatically notifies because `splice()` is a reactive array mutation.

---

### Reactive `Map`

`Map` values stored in state are automatically wrapped.

```js
state() {
  return {
    users: new Map(),
  };
},

methods: {
  addUser(id, user) {
    this.users.set(id, user);
  },

  removeUser(id) {
    this.users.delete(id);
  },

  clearUsers() {
    this.users.clear();
  },
},
```

The following `Map` mutation methods are reactive:

- `set()`
- `delete()`
- `clear()`

For example:

```js
this.users.set(1, {
  name: "Ada",
});
```

automatically notifies dependents of `users`.

A `Map` can be consumed by computed values like any other reactive state value:

```js
computed: {
  userCount(ctx) {
    return ctx.users.size;
  },
},
```

When the `Map` is structurally mutated, consumers that depend on the root `users` state key can update.

#### Objects stored in a `Map` are not deeply reactive

The contents of a `Map` are not recursively proxied:

```js
this.users.get(1).name = "Grace";
```

This does not automatically notify dependents because the `Map` itself was not structurally changed.

Use `touch()` when mutating the stored object in place:

```js
this.users.get(1).name = "Grace";
touch(this, "users");
```

Or replace the value with `Map.prototype.set()`:

```js
this.users.set(1, {
  ...this.users.get(1),
  name: "Grace",
});
```

The latter automatically notifies because `set()` is a reactive `Map` mutation.

---

### Reactive `Set`

`Set` values stored in state are automatically wrapped.

```js
state() {
  return {
    selectedIds: new Set(),
  };
},

methods: {
  select(id) {
    this.selectedIds.add(id);
  },

  deselect(id) {
    this.selectedIds.delete(id);
  },

  clearSelection() {
    this.selectedIds.clear();
  },
},
```

The following `Set` mutation methods are reactive:

- `add()`
- `delete()`
- `clear()`

For example:

```js
this.selectedIds.add(42);
```

automatically notifies dependents of `selectedIds`.

A computed value can consume the collection normally:

```js
computed: {
  selectionCount(ctx) {
    return ctx.selectedIds.size;
  },
},
```

When the `Set` is structurally mutated, consumers that depend on the root `selectedIds` state key can update.

#### Objects stored in a `Set` are not deeply reactive

Objects contained in a `Set` are not recursively proxied:

```js
state() {
  return {
    users: new Set([
      { name: "Ada" },
    ]),
  };
},
```

Mutating an object contained in the set does not automatically notify:

```js
for (const user of this.users) {
  user.name = "Grace";
}
```

Notify the root state key after the in-place mutation:

```js
for (const user of this.users) {
  user.name = "Grace";
}

touch(this, "users");
```

---

## Collection Reactivity at a Glance

| Collection | Reactive structural mutations | Nested object mutations |
| ---------- | ----------------------------- | ------------------------ |
| Array | `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin` | Require `touch()` |
| `Map` | `set`, `delete`, `clear` | Require `touch()` |
| `Set` | `add`, `delete`, `clear` | Require `touch()` |

The important distinction is:

```text
Root assignment
    │
    ├── this.user = next
    │       └── reactive write → notify
    │
    ├── this.items.push(value)
    │       └── reactive collection mutation → notify
    │
    └── this.user.name = next
            └── ordinary nested mutation → no notification
                    │
                    └── touch(this, "user")
```

Collection mutation is therefore different from ordinary nested object mutation: the collection wrapper performs the root-level notification for supported structural operations.

---

## Collections and Root Replacement

Collections can also be replaced like any other root state value:

```js
this.items = [];
this.users = new Map();
this.selectedIds = new Set();
```

Root replacement is reactive because the state property itself is assigned through the reactive store.

For example:

```js
methods: {
  resetUsers() {
    this.users = new Map();
  },
},
```

The assignment notifies dependents of `users`.

---

## Collections and Interceptors

Collection mutation methods do **not** perform a root state assignment, so they do not invoke a state interceptor.

For example:

```js
interceptors: {
  users(value) {
    // Runs when this.users is assigned.
    return value;
  },
},

methods: {
  addUser(id, user) {
    this.users.set(id, user); // interceptor does not run
  },

  replaceUsers(users) {
    this.users = users; // interceptor runs
  },
},
```

The distinction is:

- **Root assignment** → interceptor → commit → notification.
- **Collection mutation** → collection wrapper → root notification.
- **Ordinary nested object mutation** → no notification unless `touch()` or root replacement is used.

See [Interceptors](./interceptors.md).

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

Interceptors apply only to **root** assignments such as `this.count = ...`. Nested in-place mutations do not go through interceptors unless you assign a new root value.

Collection mutation methods likewise do not invoke the interceptor for the owning root key.

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

If a computed reads a nested field, it still depends on the **root** key for notification. After an ordinary nested mutation, call `touch(this, "user")` or replace `user` so the computed updates.

Collection mutations are different: supported array, `Map`, and `Set` mutations automatically notify their owning root key.

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

Only first-level keys listed in `deps` are tracked. Ordinary nested mutations notify a watcher only after the corresponding root key is updated or touched.

A supported collection mutation automatically notifies the collection's root key, so a watcher depending on that key can react:

```js
state() {
  return {
    items: [],
  };
},

watch: {
  itemsChanged: {
    deps: ["items"],
    handler(newValues) {
      console.log("items changed:", newValues.items);
    },
  },
},

methods: {
  addItem(item) {
    this.items.push(item); // watcher is notified automatically
  },
},
```

See [Watchers](./watch.md).

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
- `@bind` provides two-way binding. For nested paths such as `user.name`, the binding system updates the nested value and uses `touch()` to ensure the change participates in reactivity.
- Collection values can be read through the same public context and consumed by computed values or other reactive consumers.
- Directive expressions use Udodi's template DSL (paths, resolvers, literals) rather than arbitrary JavaScript.

For example:

```js
computed: {
  itemCount(ctx) {
    return ctx.items.length;
  },
},
```

```html
<p>Items: <span @text="itemCount"></span></p>
```

Calling:

```js
this.items.push("Apple");
```

automatically notifies the `items` root key, allowing `itemCount` and its DOM binding to update.

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
| Shallow object reactivity | Ordinary nested objects are not deeply proxied |
| Nested in-place object mutation | Call `touch(ctx, key)` or replace the root value to notify |
| Reactive arrays | Supported structural mutations notify automatically |
| Reactive `Map` | `set`, `delete`, and `clear` notify automatically |
| Reactive `Set` | `add`, `delete`, and `clear` notify automatically |
| Collection contents | Objects contained in arrays, `Map`, or `Set` are not deeply reactive |
| Collection nested mutation | Use `touch(ctx, key)` or replace the contained value |
| Root replacement | Assigning a new root value notifies automatically |

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

- [Components](./components.md) — the component model and namespace rules
- [Computed Values](./computed.md) — values derived from state
- [Methods](./methods.md) — updating state from component behavior
- [Watchers](./watch.md) — reacting to state changes
- [Interceptors](./interceptors.md) — transforming or canceling state writes
- [Props](./props.md) — inputs and live bindings from parent state
- [Using `touch()`](../reactivity/touch.md) — notifying after nested mutations
- [Reactivity Overview](../reactivity/overview.md) — signals, effects, and reactive objects
