# `@text`

The `@text` directive sets an element's `textContent` from a template expression.

Use `@text` when the text displayed by an element comes from component state, computed values, props, or a template helper.

---

## Basic Usage

```html
<span @text="userName"></span>
```

If `userName` is a reactive value, the text is updated when the value changes.

For example:

```js
import { createComponent, html, render } from "udodi";

const Greeting = createComponent({
  name: "Greeting",

  state() {
    return {
      userName: "Attamah",
    };
  },

  template: () => html`
    <p>Hello, <span @text="userName"></span></p>
  `,
});

render(Greeting(), "#app");
```

When `userName` changes, the `@text` binding updates the element's text content.

Only the dependencies read by the expression are tracked, so a change elsewhere in the component does not cause this binding to update.

---

## Static Text

For text that never changes, prefer ordinary HTML:

```html
<span>Hello</span>
```

A quoted literal can also be used with `@text`:

```html
<span @text="'Hello'"></span>
```

A quoted literal represents a fixed value and does not create a reactive dependency.

For ordinary static markup, however, `@text` is unnecessary. Use it when the text is being supplied through the template binding system.

---

## Expressions

`@text` accepts a template expression that resolves to the value to display.

### Paths

```html
<span @text="user.name"></span>
```

### Function calls

Udodi uses `:` for function arguments:

```html
<span @text="formatDate:createdAt:'MMM D'"></span>
```

### Pipelines

Values can be passed through template helpers:

```html
<span @text="userName | capitalise"></span>
```

For example:

```js
const Greeting = createComponent({
  name: "Greeting",

  state() {
    return {
      userName: "attamah",
    };
  },

  template: () => html`
    <p @text="userName | capitalise"></p>
  `,
});
```

The expression first resolves `userName` and then passes its value to the `capitalise` helper.

See [Template DSL](./dsl.md) for the expression syntax supported by templates.

---

## Null and Undefined

When the expression evaluates to `null` or `undefined`, `@text` clears the element's text content.

For example:

```js
state() {
  return {
    message: null,
  };
}
```

```html
<p @text="message"></p>
```

The resulting element has an empty `textContent`.

This prevents values such as `null` and `undefined` from being displayed literally.

Other values are converted to text before being assigned to the element.

---

## Reactive Updates

When an expression reads reactive data, `@text` tracks those reads.

```js
const Counter = createComponent({
  name: "Counter",

  state() {
    return {
      count: 0,
    };
  },

  computed: {
    message(ctx) {
      return `Count: ${ctx.count}`;
    },
  },

  template: () => html`
    <p @text="message"></p>
  `,
});
```

When `count` changes, the computed value changes and the `@text` binding updates accordingly.

The binding is fine-grained: the runtime does not need to re-render the entire component just to update this text node.

---

## Computed Values and Props

`@text` can read any value exposed to the template context.

### Computed value

```js
computed: {
  fullName(ctx) {
    return `${ctx.firstName} ${ctx.lastName}`;
  },
},
```

```html
<h1 @text="fullName"></h1>
```

### Prop

```html
<p @text="title"></p>
```

When `title` is supplied as a component prop, the binding displays its current value.

See [Computed Values](../fundamentals/computed.md) and [Props](../fundamentals/props.md) for more information.

---

## Text, Not HTML

`@text` always writes text content. It does not interpret the resulting value as HTML.

For example:

```html
<div @text="'<strong>Hello</strong>'"></div>
```

displays:

```text
<strong>Hello</strong>
```

as text rather than creating a `<strong>` element.

Use normal HTML elements when you need markup:

```html
<div>
  <strong>Hello</strong>
</div>
```

This makes `@text` safe for displaying values that may contain HTML-like characters.

---

## Complete Example

```js
import { createComponent, html, render } from "udodi";

const Profile = createComponent({
  name: "Profile",

  state() {
    return {
      userName: "Attamah",
      title: "Software Engineer",
    };
  },

  computed: {
    headline(ctx) {
      return `${ctx.userName} — ${ctx.title}`;
    },
  },

  template: () => html`
    <article>
      <h1 @text="headline"></h1>
      <p>Signed in as <span @text="userName"></span></p>
      <p @text="title | capitalise"></p>
    </article>
  `,
});

render(Profile(), "#app");
```

Here:

- `headline` reads a computed value  
- `userName` reads component state directly  
- `title | capitalise` uses a template helper through a pipeline  

Each binding updates independently when its reactive dependencies change.

---

## When to Use `@text`

| Use `@text` when… | Prefer ordinary HTML when… |
|-------------------|----------------------------|
| Text comes from state | Text is fixed |
| Text comes from a computed value | The markup is static |
| Text comes from a prop | No template binding is required |
| Text needs a helper or pipeline | You are defining the document structure |
| The displayed value changes reactively | The content is constant |

For example:

```html
<!-- Reactive -->
<span @text="user.name"></span>

<!-- Static -->
<span>Hello, Ada</span>
```

---

## Behavior

`@text`:

- Evaluates the supplied template expression  
- Tracks reactive dependencies read by that expression  
- Updates the element's `textContent` when those dependencies change  
- Clears `textContent` when the result is `null` or `undefined`  
- Converts other values to their string representation  
- Treats the result as text rather than HTML  
- Reports evaluation failures through the runtime's directive diagnostics  

The directive is intended for text content only. Use other directives or normal HTML elements for attributes, classes, styles, events, and DOM structure.

---

## Syntax Summary

| Form | Behavior |
|------|----------|
| `@text="userName"` | Resolves and displays `userName` reactively |
| `@text="user.name"` | Resolves a nested value |
| `@text="formatDate:date"` | Calls a template function |
| `@text="userName \| capitalise"` | Passes the value through a helper |
| `@text="'Hello'"` | Displays a static quoted value |
| `null` / `undefined` | Clears `textContent` |
| Other values | Converted to text |

---

## Next Steps

* [Template DSL](./dsl.md) — expression syntax, paths, calls, pipelines, and conditionals  
* [`@bind`](./bind.md) — bind form controls to component state  
* [`@if`](./if.md) — conditionally create DOM  
* [`@show`](./show.md) — conditionally show or hide an element  
* [`@class`](./class.md) — manage static and reactive classes  
* [`@style`](./style.md) — manage inline styles  
* [Template Overview](./overview.md) — understand how templates and directives fit together  
