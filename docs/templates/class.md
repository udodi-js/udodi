# `@class`

The `@class` directive applies CSS classes to an element from static values or reactive template expressions.

Use `@class` when class membership depends on component state. For classes that never change, use the normal HTML `class` attribute.

---

## Basic Usage

```html
<div @class="sizeClass"></div>
```

If `sizeClass` evaluates to `"card large"`, the corresponding classes are added to the element.

Multiple bindings can be combined:

```html
<div @class="isActive=>'active' sizeClass"></div>
```

Each binding contributes its class tokens to the element's dynamic class set.

---

## Static Classes

A fully quoted value is treated as a static class list and applied once:

```html
<div @class="'btn primary'"></div>
```

The value is split into class tokens; empty tokens are ignored.

For ordinary static classes, prefer the standard HTML form:

```html
<div class="btn primary"></div>
```

Static `@class` is useful when the class value needs to remain within the directive system.

---

## Dynamic Classes

Unquoted bindings are evaluated reactively. A binding can resolve to a string or an array of strings.

```html
<div @class="theme"></div>
<div @class="classList"></div>
```

For example:

```js
state() {
  return {
    theme: "card large",
  };
},

computed: {
  classList(ctx) {
    return ["card", ctx.active ? "active" : ""];
  },
},
```

The resulting values are normalized into class tokens.

| Result                 | Effect                                   |
| ---------------------- | ---------------------------------------- |
| `null` / `undefined`   | No classes                               |
| Empty string           | No classes                               |
| String                 | Split into class tokens                  |
| Array                  | Each string entry contributes its tokens |
| Conditional expression | Contributes its result when truthy       |

See [Template DSL](./dsl.md) for expression syntax.

---

## Conditional Classes

Use the `=>` conditional syntax to add a class only when a condition is truthy:

```html
<div @class="isActive=>'active'"></div>
```

Multiple bindings can be combined:

```html
<button
  @class="primary=>'btn-primary' disabled=>'is-disabled' size"
>
  Save
</button>
```

If `primary` is truthy, `btn-primary` is included. If `disabled` is falsy, `is-disabled` is not included. `size` contributes whatever class tokens its value produces.

`@class` uses the Template DSL; it does not use JavaScript object-map syntax such as:

```html
<!-- Not supported -->
<div @class="{ active: isActive }"></div>
```

---

## Base Classes

Classes declared with the normal `class` attribute are treated as **base classes**.

`@class` manages only the dynamic classes produced by its bindings. It does not remove a base class when a dynamic binding stops producing that same class.

```html
<div class="card" @class="featured=>'featured'">
  ...
</div>
```

Here, `card` remains on the element permanently, while `featured` is managed by `@class`.

This also means that a class can safely appear in both the base and dynamic class sets:

```html
<div class="card" @class="active=>'card active'"></div>
```

The directive will not remove `card` when the condition becomes false because it belongs to the element's original class list.

---

## Reactive Diffing

Dynamic class tokens are reconciled whenever a reactive dependency changes.

Conceptually:

```text
    previous dynamic classes
              │
              ▼
       evaluate bindings
              │
              ▼
      normalize class tokens
              │
              ▼
         compare sets
        ┌─────┴─────┐
        ▼           ▼
   remove stale   add new

```

Udodi:

* removes dynamic classes that are no longer produced;
* adds newly produced classes;
* leaves unchanged classes untouched;
* preserves classes owned by the original `class` attribute.

Only the classes managed by `@class` participate in this diff.

---

## Example

```js
import { createComponent, html, render } from "udodi";

const Button = createComponent({
  name: "Button",

  state() {
    return {
      primary: true,
      disabled: false,
      size: "md",
    };
  },

  template: () => html`
    <button
      class="btn"
      @class="primary=>'btn-primary' disabled=>'is-disabled' size"
    >
      Action
    </button>
  `,
});

render(Button(), "#app");
```

The resulting button has:

```text
btn btn-primary md
```

If `primary` becomes false, `btn-primary` is removed. If `disabled` becomes true, `is-disabled` is added. The base class `btn` remains throughout.

---

## `@class` and Component Styles

`@class` works independently from component-scoped CSS.

Use component styles to define the CSS rules and `@class` to control class membership:

```js
style: css`
  .card {
    padding: 1rem;
  }

  .card.featured {
    border-color: blue;
  }
`,

template: () => html`
  <article class="card" @class="featured=>'featured'">
    ...
  </article>
`,
```

See [Component Styles](../fundamentals/styles.md) for scoped component CSS.

---

## Behavior

`@class`:

* Applies a fully quoted class list once.
* Evaluates unquoted bindings reactively.
* Accepts string and array results.
* Supports conditional `=>` expressions.
* Normalizes results into individual class tokens.
* Tracks and diffs the dynamic classes it owns.
* Preserves the element's original `class` classes.
* Removes the `@class` attribute after binding.
* Disposes its reactive effect with the component scope.

---

## Syntax Summary

| Form                           | Behavior                                 |
| ------------------------------ | ---------------------------------------- |
| `@class="'a b'"`               | Add `a` and `b` once                     |
| `@class="name"`                | Reactively use the value of `name`       |
| `@class="flag=>'active'"`      | Add `active` while `flag` is truthy      |
| `@class="flag=>'active' size"` | Combine conditional and dynamic bindings |
| String result                  | Split into class tokens                  |
| Array result                   | Add tokens from each string entry        |
| `null` / `undefined` / `""`    | Contribute no classes                    |

---

## Constraints

| Rule               | Detail                                                    |
| ------------------ | --------------------------------------------------------- |
| Static values      | A fully quoted expression is applied once                 |
| Dynamic values     | Unquoted bindings are reactive                            |
| Class ownership    | Only classes produced by `@class` are dynamically managed |
| Base classes       | Original `class` values are preserved                     |
| Expressions        | Uses the Template DSL                                     |
| Conditional syntax | Use `=>` for conditional classes                          |
| Runtime attribute  | `@class` is removed after binding                         |

---

## Minimal Example

```js
import { createComponent, html, render } from "udodi";

const Badge = createComponent({
  name: "Badge",

  state() {
    return {
      active: true,
    };
  },

  methods: {
    toggle() {
      this.active = !this.active;
    },
  },

  template: () => html`
    <button
      class="badge"
      @class="active=>'active'"
      @on="click=toggle"
    >
      Status
    </button>
  `,
});

render(Badge(), "#app");
```

When `active` is `true`, the button has both `badge` and `active`. When it becomes `false`, only the base `badge` class remains.

---

## Next Steps

* [`@style`](./style.md) — reactive inline styles
* [Component Styles](../fundamentals/styles.md) — scoped component CSS
* [Template DSL](./dsl.md) — expressions and conditionals
* [`@show`](./show.md) — reactive visibility
* [`@if`](./if.md) — conditional mounting
* [Template Overview](./overview.md) — template directive fundamentals
