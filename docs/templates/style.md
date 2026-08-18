# `@style`

The `@style` directive applies **inline CSS** to an element from static declarations or reactive template expressions.

Use `@style` when individual CSS properties depend on component state. For reusable presentation and layout rules, prefer component `style` / scoped CSS and use [`@class`](./class.md) to switch between styles.

---

## Basic Usage

```html
<div @style="boxStyle"></div>
```

If `boxStyle` produces:

```js
{
  color: "steelblue",
  padding: "1rem",
}
```

Udodi writes those properties to the element's inline `style`.

Multiple bindings can be combined:

```html
<div @style="baseStyle emphasisStyle"></div>
```

Bindings are evaluated from left to right. When multiple bindings produce the same property, the **later binding wins**.

---

## Static Styles

A fully quoted declaration string is treated as static and applied once:

```html
<div @style="'color:red;padding:8px'"></div>
```

For fixed presentation, a normal `style` attribute is usually clearer:

```html
<div style="color:red;padding:8px"></div>
```

Component CSS is generally preferable when the styles are part of the component's design rather than a per-instance value.

Static `@style` is useful when a declaration needs to pass through the directive system.

---

## Dynamic Results

Reactive bindings can produce CSS in several forms:

| Result                      | Example                                  | Behavior                     |
| --------------------------- | ---------------------------------------- | ---------------------------- |
| String                      | `"color:red;padding:8px"`                | Parsed as CSS declarations   |
| Object                      | `{ color: "red", padding: "8px" }`       | Property/value map           |
| Array of pairs              | `[["color", "red"], ["padding", "8px"]]` | Ordered property/value pairs |
| `null` / `undefined` / `""` | `null \| undefined \| ""`                | Contributes no properties    |

For example:

```html
<div @style="themeStyles"></div>
```

```js
state() {
  return {
    color: "steelblue",
    padding: "1rem",
  };
},

computed: {
  themeStyles(ctx) {
    return {
      color: ctx.color,
      padding: ctx.padding,
    };
  },
},
```

The same directive can combine different bindings:

```html
<div @style="baseStyles emphasisStyles"></div>
```

If both bindings produce `color`, the value from `emphasisStyles` takes precedence.

Empty property names and empty values do not contribute styles.

---

## Multiple Bindings

Each space-separated expression represents a separate style binding:

```html
<div @style="layoutStyles themeStyles stateStyles"></div>
```

Udodi evaluates the bindings in order and merges their results.

For example:

```text
layoutStyles
      │
      ▼
themeStyles
      │
      ▼
stateStyles
      │
      ▼
 final style map
```

A property produced by a later binding replaces the value produced by an earlier binding.

This makes it possible to define general styles first and override individual properties conditionally.

---

## Base Styles

Inline styles already present on the element before `@style` is applied are treated as **base styles**.

```html
<div style="margin:0" @style="dynamicBox">
  ...
</div>
```

The directive tracks only the properties it dynamically manages.

If a dynamic binding later stops producing a property:

* the original base value is restored when one existed;
* otherwise the inline property is removed.

For example:

```html
<div style="margin:0" @style="boxStyle"></div>
```

If `boxStyle` temporarily produces:

```js
{ margin: "2rem" }
```

the element uses `2rem`.

When the binding stops producing `margin`, the original `0` is restored.

This prevents `@style` from permanently destroying inline styles that were already present.

---

## Reactive Diffing

Dynamic styles are reconciled whenever their reactive dependencies change.

Conceptually:

```text
      previous properties
              │
              ▼
      evaluate bindings
              │
              ▼
      normalize results
              │
              ▼
      merge in binding order
              │
              ▼
      compare with previous styles
      ┌───────┼───────┐
      ▼       ▼       ▼
    restore  set    remove
```

On each reactive update, Udodi:

1. Evaluates the style bindings.
2. Normalizes their results.
3. Merges them in declaration order.
4. Restores or removes properties that are no longer produced.
5. Updates properties whose values changed.
6. Leaves unchanged properties untouched.

Only properties managed by `@style` participate in this dynamic reconciliation.

---

## Example

```js
import { createComponent, html, render } from "udodi";

const Box = createComponent({
  name: "Box",

  state() {
    return {
      accent: "#3366ff",
      wide: false,
    };
  },

  computed: {
    boxStyle(ctx) {
      return {
        border: `2px solid ${ctx.accent}`,
        width: ctx.wide ? "100%" : "12rem",
      };
    },
  },

  methods: {
    toggle() {
      this.wide = !this.wide;
    },
  },

  template: () => html`
    <div @style="boxStyle" @on="click=toggle">
      Click to resize
    </div>
  `,
});

render(Box(), "#app");
```

The `border` and `width` properties are controlled by `@style`.

When `accent` changes, only `border` needs to be updated. When `wide` changes, `width` changes between `12rem` and `100%`.

---

## `@style` vs Component CSS

|          | `@style`                     | Component `style: css\`...``              |
| -------- | ---------------------------- | ----------------------------------------- |
| Output   | Inline styles                | Scoped stylesheet rules                   |
| Scope    | Individual element           | Component stylesheet                      |
| Best for | Reactive per-instance values | Layout, presentation, reusable rules      |
| Updates  | Reactive expressions         | Use `@class` for state-dependent variants |

For example, define the design in component CSS and use `@class` for state-dependent variants:

```js
style: css`
  .card {
    padding: 1rem;
  }

  .card.featured {
    border: 2px solid blue;
  }
`,

template: () => html`
  <article class="card" @class="featured=>'featured'">
    ...
  </article>
`,
```

Use `@style` when the actual CSS value is dynamic:

```html
<article
  class="card"
  @style="accentStyle"
>
  ...
</article>
```

See [Component Styles](../fundamentals/styles.md) and [`@class`](./class.md).

---

## When to Use `@style`

`@style` is particularly useful for values that naturally come from state:

```html
<div @style="widthStyle"></div>
<div @style="positionStyle"></div>
<div @style="themeStyle"></div>
```

Examples include:

* dimensions calculated from state;
* colors selected dynamically;
* inline positioning;
* animation or transition values;
* user-configurable presentation;
* values calculated at runtime.

For stable component presentation, prefer component CSS.

---

## Behavior

`@style`:

* Applies fully quoted declaration strings once.
* Evaluates unquoted bindings reactively.
* Accepts declaration strings, objects, and property/value pairs.
* Merges multiple bindings from left to right.
* Gives later bindings precedence over earlier bindings.
* Tracks the properties produced by the directive.
* Restores original inline values when dynamic properties disappear.
* Removes dynamic properties that have no original value.
* Avoids rewriting unchanged properties.
* Removes the `@style` attribute after binding.
* Disposes its reactive effect with the component scope.

---

## Syntax Summary

| Form                        | Behavior                                  |
| --------------------------- | ----------------------------------------- |
| `@style="'color:red'"`      | Apply static inline declaration once      |
| `@style="styles"`           | Reactively evaluate a style result        |
| `@style="a b"`              | Merge multiple bindings; later values win |
| String result               | CSS declaration list                      |
| Object result               | CSS property/value map                    |
| Pair-array result           | Ordered property/value pairs              |
| `null` / `undefined` / `""` | Contributes no properties                 |

---

## Constraints

| Rule              | Detail                                                          |
| ----------------- | --------------------------------------------------------------- |
| Inline only       | Writes to the element's inline style                            |
| Static values     | Fully quoted values are applied once                            |
| Dynamic values    | Unquoted bindings are reactive                                  |
| Merge order       | Later bindings override earlier bindings                        |
| Base styles       | Original inline values are restored when dynamic ownership ends |
| Empty values      | Ignored                                                         |
| Runtime attribute | `@style` is removed after binding                               |
| Template DSL      | Expressions use the template expression syntax                  |

---

## Minimal Example

```js
import { createComponent, html, render } from "udodi";

const Label = createComponent({
  name: "Label",

  state() {
    return {
      color: "crimson",
    };
  },

  computed: {
    textStyle(ctx) {
      return {
        color: ctx.color,
      };
    },
  },

  template: () => html`
    <span @style="textStyle">
      Hello
    </span>
  `,
});

render(Label(), "#app");
```

When `color` changes, the inline `color` property is updated reactively.

---

## Next Steps

* [`@class`](./class.md) — reactive CSS classes
* [Component Styles](../fundamentals/styles.md) — scoped component CSS
* [Template DSL](./dsl.md) — template expression syntax
* [`@attr`](./attr.md) — reactive attributes
* [Template Overview](./overview.md) — how directives work together
