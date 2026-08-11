# Computed Values

Computed values are **derived reactive values**. They let a component expose values calculated from its reactive state without manually keeping those values in sync.

Declare computed values with the `computed` option of `createComponent()`. Each computed property is a function that receives the component's public context and returns the derived value.

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

  computed: {
    doubled(ctx) {
      return ctx.count * 2;
    },

    displayValue(ctx) {
      return `${ctx.count} × 2 = ${ctx.doubled}`;
    },
  },

  methods: {
    increment() {
      this.count += this.step;
    },
  },

  template: () => html`
    <main class="counter">
      <p class="value"><span @text="count"></span></p>
      <p><span @text="displayValue"></span></p>
      <button @on="click=increment">+</button>
    </main>
  `,
});

render(Counter(), "#app");
```

When `count` changes, the computed values that depend on it are invalidated. Reading those values produces their current result, and bindings that consume them update reactively.

---

## Defining Computed Values

A computed definition is a function whose argument is the component's **public context**:

```js
computed: {
  fullName(ctx) {
    return `${ctx.firstName} ${ctx.lastName}`;
  },

  total(ctx) {
    return ctx.price * ctx.quantity;
  },
},
```

The context gives the computed function access to the component's reactive state and other exposed component values.

Computed functions should normally be **pure**: derive and return a value rather than performing side effects.

For operations that perform actions, mutate state, respond to events, or perform asynchronous work, use a method instead.

---

## Reading Computed Values

Computed properties behave like reactive properties on the public component context.

### In templates

Reference the computed name directly:

```html
<p @text="doubled"></p>
<p @text="displayValue"></p>
```

You do not call the computed function from a template.

### In methods

Computed values can also be read through `this`:

```js
methods: {
  logTotal() {
    console.log(this.total);
  },
},
```

Treat computed properties as **read-only values**, not functions to invoke.

---

## Dependency Tracking

Udodi's computed values use the reactive dependency-tracking system.

A computed tracks the reactive values that are actually read while it evaluates:

```js
computed: {
  doubled(ctx) {
    return ctx.count * 2;
  },

  total(ctx) {
    return ctx.price * ctx.quantity;
  },
},
```

`doubled` depends on `count`, while `total` depends on both `price` and `quantity`.

Dependencies are not declared manually. Udodi's reactivity system records them while the computed function executes.

This also means that conditional reads can produce conditional dependencies:

```js
computed: {
  display(ctx) {
    return ctx.enabled
      ? ctx.value
      : "Disabled";
  },
},
```

Here, `enabled` is always read. `value` is tracked when the enabled branch is evaluated.

---

## Computed Values Can Depend on Other Computed Values

A computed can read another computed through the context:

```js
computed: {
  subtotal(ctx) {
    return ctx.price * ctx.quantity;
  },

  tax(ctx) {
    return ctx.subtotal * ctx.taxRate;
  },

  total(ctx) {
    return ctx.subtotal + ctx.tax;
  },
},
```

The dependency chain is tracked automatically:

```text
price ─────┐
           ├─> subtotal ──┐
quantity ──┘              │
                          ├─> total
taxRate ─────> tax ───────┘
```

Changing `price` or `quantity` invalidates `subtotal`, which in turn invalidates values that depend on it.

There is no need to manually recompute dependent values.

---

## Lazy Evaluation and Caching

Computed values are **lazy and cached**.

A computed function does not need to execute immediately when the component is created. Its value is evaluated when it is first read.

After evaluation, the result is retained until one of its tracked dependencies changes.

Conceptually:

```text
first read
    │
    ▼
evaluate ──> cache result
    │
    ▼
subsequent reads
    │
    └──> return cached result

dependency changes
    │
    ▼
invalidate cached result
    │
    ▼
next read evaluates again
```

This makes computed values useful for derived calculations that may be consumed by multiple parts of a component without repeatedly executing the same calculation.

Lazy evaluation also means that an unused computed does not incur the cost of evaluating its function merely because it was declared.

---

## Reactive Updates

Computed values participate in Udodi's normal reactive update cycle.

For example:

```js
const Cart = createComponent({
  name: "Cart",

  state() {
    return {
      price: 20,
      quantity: 2,
    };
  },

  computed: {
    total(ctx) {
      return ctx.price * ctx.quantity;
    },
  },

  methods: {
    increase() {
      this.quantity++;
    },
  },

  template: () => html`
    <p>Total: $<span @text="total"></span></p>
    <button @on="click=increase">+</button>
  `,
});
```

When `quantity` changes:

```text
quantity changes
      │
      ▼
total is invalidated
      │
      ▼
the bound value is re-evaluated
      │
      ▼
the DOM receives the new value
```

You do not need to manually assign the computed result back into state.

---

## Nested State

Udodi's root state reactivity and nested-object reactivity should be distinguished when working with computed values.

Consider:

```js
state() {
  return {
    pricing: {
      base: 10,
      tax: 2,
    },
  };
},

computed: {
  total(ctx) {
    return ctx.pricing.base + ctx.pricing.tax;
  },
},
```

If `pricing` is replaced through the component context, the root state change is reactive:

```js
this.pricing = {
  base: 20,
  tax: 4,
};
```

For an in-place nested mutation, use `touch()` when the nested object is not itself providing the notification required by the dependency:

```js
methods: {
  setTax(tax) {
    this.pricing.tax = tax;
    touch(this, "pricing");
  },
},
```

`touch()` signals that the root `pricing` value should be considered changed without replacing the object itself.

See [Using `touch()`](../reactivity/touch.md) for the complete API.

---

## Computed Values Are Read-Only

Computed properties represent derived data. They are not writable state.

Given:

```js
computed: {
  total(ctx) {
    return ctx.price * ctx.quantity;
  },
},
```

`total` should be read:

```js
console.log(this.total);
```

rather than assigned:

```js
this.total = 100; // invalid
```

To change the result of a computed value, change the state or other reactive values from which it is derived:

```js
this.price = 50;
this.quantity = 2;
```

The computed value then reflects the new inputs automatically.

---

## Root-Level Uniqueness

Computed properties occupy the component's root namespace.

A computed property therefore cannot use a name already claimed by another root-level component member.

Computed names must not conflict with:

* state keys
* method names
* other computed names
* reserved component/context names

For example, this is invalid:

```js
createComponent({
  name: "Counter",

  state() {
    return {
      total: 0,
    };
  },

  computed: {
    total(ctx) {
      return ctx.price * ctx.quantity;
    },
  },
});
```

The component cannot expose two different root-level meanings for `total`.

Namespace validation happens when the component is created, so invalid definitions fail early rather than producing ambiguous runtime behavior.

---

## Component Lifetime and Cleanup

Computed values are associated with the component's reactive scope.

When the component is destroyed, the reactive resources associated with its computed values are cleaned up with that scope.

This means computed definitions do not require manual teardown from component code.

---

## Computed vs Methods

|              | Computed                                | Methods                               |
| ------------ | --------------------------------------- | ------------------------------------- |
| Purpose      | Derived reactive values                 | Actions and imperative logic          |
| Invocation   | Read as a property                      | Called explicitly                     |
| Evaluation   | Lazy and cached                         | Runs when called                      |
| Dependencies | Tracked automatically                   | Not tracked as computed dependencies  |
| Side effects | Should generally be avoided             | Appropriate when performing actions   |
| Typical use  | Totals, labels, flags, formatted values | Event handlers, mutations, async work |

A useful rule is:

> **If something describes a value, use a computed. If something performs an action, use a method.**

For example:

```js
computed: {
  fullName(ctx) {
    return `${ctx.firstName} ${ctx.lastName}`;
  },
},

methods: {
  save() {
    // perform an action
  },
},
```

See [Methods](./methods.md).

---

## Complete Example

The following example combines state, computed dependencies, methods, and template bindings:

```js
import { createComponent, html, render } from "udodi";

const OrderSummary = createComponent({
  name: "OrderSummary",

  state() {
    return {
      price: 10,
      quantity: 2,
      taxRate: 0.2,
    };
  },

  computed: {
    subtotal(ctx) {
      return ctx.price * ctx.quantity;
    },

    tax(ctx) {
      return ctx.subtotal * ctx.taxRate;
    },

    total(ctx) {
      return ctx.subtotal + ctx.tax;
    },

    displayTotal(ctx) {
      return `Total: $${ctx.total.toFixed(2)}`;
    },
  },

  methods: {
    setQuantity(quantity) {
      this.quantity = quantity;
    },
  },

  template: () => html`
    <div class="summary">
      <p @text="displayTotal"></p>
    </div>
  `,
});

render(OrderSummary(), "#app");
```

The dependency chain is:

```text
price ────────┐
              ▼
           subtotal ─────┐
quantity ─────┘          │
                         ▼
taxRate ────────> tax ──> total ──> displayTotal
```

Changing `price`, `quantity`, or `taxRate` propagates through the relevant computed values and ultimately updates the `displayTotal` binding.

---

## Constraints

| Constraint             | Behavior                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Root-level namespace   | Computed names must be unique within the component context                               |
| Read-only              | Computed values cannot be assigned through the public context                            |
| Lazy                   | A computed is evaluated when its value is first needed                                   |
| Cached                 | The last computed result is reused while its dependencies remain valid                   |
| Automatic dependencies | Reactive reads are tracked during evaluation                                             |
| Nested mutations       | Use `touch()` when an in-place nested mutation needs an explicit root-level notification |
| Cleanup                | Computed reactive resources are cleaned up with the component scope                      |
| Side effects           | Computed functions should normally remain pure                                           |

---

## Next Steps

* [Components](./components.md) — component structure and root-level namespace rules
* [State](./state.md) — reactive state used by computed values
* [Methods](./methods.md) — actions and imperative logic
* [Watchers](./watch.md) — reacting to changes for side effects
* [Interceptors](./interceptors.md) — transforming root state writes
* [Context](./context.md) — the public component context
* [Using `touch()`](../reactivity/touch.md) — notifying the reactive system after nested mutations
* [Reactivity Overview](../reactivity/overview.md) — Udodi's reactive primitives
