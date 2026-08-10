# Methods

Methods define the behavior of a component: event handlers, helpers, formatters, and other logic that runs against the component context.

They are declared under the `methods` option, bound to the public component context, and available as root-level names in templates and in other component code.

---

## Defining Methods

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
      <button @on="click=decrement">-</button>
      <button @on="click=reset">Reset</button>
      <button @on="click=increment">+</button>
    </main>
  `,
});

render(Counter(), "#app");
```

Each method is a function. Non-function values under `methods` are ignored.

---

## Binding and `this`

Methods are bound so that `this` is the **public component context**.

Inside a method you can:

- Read and write top-level reactive state: `this.count++`
- Read computed values: `this.doubled`
- Call other methods: `this.reset()`
- Read props: `this.userName`
- Access `this.refs`, `this.name`, and `this.ud`
- Register cleanup with `this.cleanup(fn)` after mount

```js
methods: {
  increment() {
    this.count += this.step;
  },

  incrementAndLog() {
    this.increment();
    console.log("count is", this.count);
  },
},
```

Do not rely on a raw `this` from an unbound function. Always go through the component’s methods (or call them with the correct context) so state updates stay on the public membrane.

---

## Methods in Templates

Reference methods from directives by name. The template DSL does not allow arbitrary JavaScript expressions inside directives.

### Events with `@on`

```html
<button @on="click=increment">+</button>
<button @on="click=decrement">-</button>
<button @on="click=reset">Reset</button>
```

The method name is a path token on the component context. Udodi invokes the bound method when the event fires.

### Resolvers in other directives

Methods can act as resolvers (formatters and helpers) in directive expressions:

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

```html
<span @text="formatCount:count"></span>
<span @text="currency:total:'USD'"></span>
```

The first segment is the method name; later segments are path lookups or literal arguments according to the template DSL.

See [Template DSL](../templates/dsl.md) and [Templates](../templates/).

---

## Methods vs Computed Values

| | Methods | Computed values |
| --- | --- | --- |
| Purpose | Actions and helpers | Derived values |
| Runs when | Called explicitly | Dependencies change |
| Side effects | Allowed | Prefer pure |
| Typical use | Event handlers, formatters, async work | Display values, totals, flags |

Use a **method** when something should happen (update state, call an API, focus an element).

Use a **computed** when a value can be derived from existing state:

```js
// Prefer computed for derived data
computed: {
  doubled(ctx) {
    return ctx.count * 2;
  },
},

// Prefer methods for actions
methods: {
  increment() {
    this.count++;
  },
},
```

See [Computed Values](./computed.md).

---

## Methods and State

Methods are the primary place to update component state:

```js
methods: {
  setCount(value) {
    this.count = value;
  },

  rename(nextLabel) {
    this.user.label = nextLabel;
    touch(this, "user");
  },
},
```

Root assignments go through interceptors when defined. Nested in-place mutations should use `touch()` (or replace the root value) so dependents update.

See [State](./state.md) and [Using `touch()`](../reactivity/touch.md).

---

## Methods and Props

Methods can read props the same way they read state:

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

// Parent
Greeter({ userName: "Ada" });
```

Prop names must not collide with method names (or with state / computed keys). See [Props](./props.md).

---

## Async Methods

Methods may be `async` and perform asynchronous work:

```js
methods: {
  async save() {
    this.saving = true;
    try {
      await api.save({ count: this.count });
    } finally {
      this.saving = false;
    }
  },
},
```

```html
<button @on="click=save" @attr="disabled:saving">Save</button>
```

Keep UI feedback in reactive state (`saving`, `error`, etc.) so templates can respond without imperative DOM updates.

---

## Accessing the DOM

Use `@ref` and `this.refs` when a method needs an element:

```js
methods: {
  focusInput() {
    this.refs.query?.focus();
  },
},
```

```html
<input @ref="query" @bind="query" />
<button @on="click=focusInput">Focus</button>
```

Prefer declarative bindings when possible; reach for refs when the browser API requires an element (focus, scroll, measure, etc.).

---

## Calling Methods from Other Methods

Methods can call each other through `this`:

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

---

## Root-Level Names

Method names participate in the same root namespace as `state`, `computed`, and `props`.

Every root-level name must be unique:

```js
// ❌ "reset" is both a method and a state key
const Example = createComponent({
  state() {
    return {
      reset: false,
    };
  },

  methods: {
    reset() {
      this.reset = true; // ambiguous
    },
  },
});
```

Method names cannot use reserved keywords:

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
methods: {
  name() {
    // ...
  },
},
```

Udodi validates method keys when the component is created. Collisions throw an error that identifies the component, key, and namespace.

---

## What Methods Are Not

- **Not** the place to declare derived values — use `computed`
- **Not** automatically tracked for reactivity — calling a method does not create a dependency; reading state inside a computed or effect does
- **Not** unbound free functions — they are always tied to the public context when registered through `methods`

---

## Constraints

| Constraint | Behavior |
| ---------- | -------- |
| Values under `methods` should be functions | Non-functions are skipped |
| Unique root keys | Cannot collide with `state`, `computed`, or `props` |
| No reserved keywords | Reserved names cannot be method keys |
| Bound to public context | `this` is the public membrane |
| Template access by name | Directive DSL uses method path tokens, not arbitrary JS |

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

---

## Next Steps

* [Components](./components.md) — the component model and namespace rules  
* [State](./state.md) — reactive state that methods update  
* [Computed Values](./computed.md) — derived values vs methods  
* [Watchers](./watch.md) — side effects driven by state changes  
* [Props](./props.md) — inputs available on the same context  
* [Context](./context.md) — the public context membrane  
* [Templates](../templates/) — `@on` and resolver syntax  
