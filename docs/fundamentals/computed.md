# Computed Values

Computed values are derived data that update automatically when the reactive state they depend on changes.

In Udodi, you declare them under the `computed` option of `createComponent()`. Each entry is a function that receives the public component context and returns a value. The runtime turns that function into a lazy, cached computed property on the context.

---

## Defining Computed Values

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

When `count` changes, `doubled` and `displayValue` recalculate and any DOM bindings that use them update.

---

## How Computed Works

Each computed entry is registered like this (simplified from the runtime):

```js
internalContext[computedName] = computed(
  () => computeFn(publicContextMembrane),
  computedScope
);
```

- The function is wrapped with Udodi’s `computed()` primitive.
- Dependencies are tracked automatically when the function reads reactive state (or other computeds) through the public context.
- The result is cached and only recomputed when a tracked dependency changes.
- On the public context membrane, reading a computed key **calls** the computed getter and returns the current value (you do not call it yourself in templates).

Cleanup for computed effects is tied to the component’s computed scope and runs on unmount.

---

## Access Patterns

### In templates

Use the computed name as a path. The membrane evaluates it for you:

```html
<span @text="doubled"></span>
<span @text="displayValue"></span>
```

### In methods or lifecycle hooks

Read it as a property (the membrane invokes the underlying computed):

```js
methods: {
  logDoubled() {
    console.log(this.doubled);
  },
},
```

Avoid calling it as a function in user code when going through the public context; treat it like a reactive property.

---

## Dependency Tracking

Computed tracking is fine-grained and based on what the function actually reads:

```js
computed: {
  // Tracks only `count`
  doubled(ctx) {
    return ctx.count * 2;
  },

  // Tracks `count` and `doubled` (and thus transitively `count`)
  displayValue(ctx) {
    return `${ctx.count} × 2 = ${ctx.doubled}`;
  },

  // Tracks only `price` and `quantity`
  total(ctx) {
    return ctx.price * ctx.quantity;
  },
},
```

If a dependency is a nested object and you mutate it in place, you must `touch()` the parent key (or replace it) for the computed to see the change.

---

## Nested State and Computed Values

Because reactivity is shallow, nested objects need an explicit signal when mutated in place:

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

methods: {
  setTax(tax) {
    // In-place mutation — must touch the root key
    this.pricing.tax = tax;
    touch(this, "pricing");
  },

  setPricing(base, tax) {
    // Full replacement — notifies automatically
    this.pricing = { base, tax };
  },
},
```

---

## Root-Level Uniqueness

Computed keys are registered in the same collision registry as state and methods:

```js
const stateKeys = Object.keys(lastStateInstance);
const computedKeys = Object.keys(computedProps);
const methodKeys = Object.keys(methods);
// ...
// Each key is passed through registerAndVerifyKey(...)
```

A computed name that matches a state key or method name will throw a namespace collision error at component creation time.

Computed names also cannot be reserved keywords (`name`, `state`, `ud`, etc.).

---

## Lazy Evaluation and Caching

Each computed is wrapped with Udodi’s `computed()` primitive:

- Evaluation is lazy (runs on first read).
- The result is cached.
- Recomputation happens only when a tracked dependency changes.
- On the public context membrane, reading a computed key evaluates the getter and returns the current value (you do not call it as a function in templates).

Cleanup for computed effects is tied to the component’s computed scope and runs on unmount.

---

## Example: Formatting and Combining Values

```js
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
    setQuantity(q) {
      this.quantity = q;
    },
  },

  template: () => html`
    <div class="summary">
      <p @text="displayTotal"></p>
    </div>
  `,
});
```

Changing `quantity` or `price` flows through `subtotal` → `tax` → `total` → `displayTotal` and updates the bound DOM.

---

## Constraints Specific to State Keys

State keys:

- Must not collide with computed or method names
- Must not be reserved keywords
- Are the only keys that are writable through the public context membrane (along with the special `_injectCleanupHook` path used by the runtime)

Attempting to set a non-state root key on the public context throws a mutation error.

---

## Summary

- Define state with `state()` returning a fresh object per instance.
- Only top-level keys are reactive.
- For nested changes, prefer `touch(this, "rootKey")` after in-place mutation; replacement of the root key also works.
- Keep state keys unique across state, computed, methods, and props.
- Never use reserved keywords as state keys.
- Interceptors can transform or block root writes.

---

## Next Steps

* [Components](./components.md)  
* [Computed Values](./computed.md)  
* [Methods](./methods.md)  
* [Watchers](./watch.md)  
* [Interceptors](./interceptors.md)  
* [Lifecycle](./lifecycle.md)  
* [Props](./props.md)  
* [Context](./context.md)  
* [Component Styles](./styles.md)  
* [Reactivity](../reactivity/)  
