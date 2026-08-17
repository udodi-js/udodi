# `@show`

The `@show` directive toggles an element’s visibility with the DOM `hidden` property.

The element **stays mounted**. When the condition is truthy, `hidden` is cleared; when falsy, `hidden` is set. Use [`@if`](./if.md) when the element should be created and removed instead.

---

## Basic Usage

```html
<div @show="menuOpen">
  Menu
</div>
```

When `menuOpen` is truthy, the element is shown. When falsy, it is hidden.

`@show` is reactive, so visibility updates automatically when its dependencies change.

---

## Expressions

`@show` accepts a template expression. Quoted string literals are not valid conditions.

```html
<div @show="open"></div>
<div @show="user"></div>
<div @show="greater:count:0"></div>
```

```js
methods: {
  greater(value, threshold) {
    return value > threshold;
  },
},
```

See [Template DSL](./dsl.md) for expression syntax.

---

## Example

```js
import { createComponent, html, render } from "udodi";

const Menu = createComponent({
  name: "Menu",

  state() {
    return {
      open: false,
    };
  },

  methods: {
    toggle() {
      this.open = !this.open;
    },
  },

  template: () => html`
    <div>
      <button @on="click=toggle">
        Toggle
      </button>

      <nav @show="open">
        <a href="#home">Home</a>
        <a href="#about">About</a>
      </nav>
    </div>
  `,
});

render(Menu(), "#app");
```

The `<nav>` remains in the document; only its `hidden` state changes.

---

## `@show` vs `@if`

| | `@show` | `@if` |
|--|---------|-------|
| DOM presence | Always mounted | Mounted only when matched |
| Mechanism | `element.hidden = !visible` | Insert / remove branch instance |
| Subtree | Preserved (focus, form state, effects) | Created and torn down per activation |
| Chains | Single condition | `@if` / `@elseif` / `@else` |
| Typical use | Toggle visibility | Conditional structure |

```html
<!-- Hidden but still in the DOM -->
<div @show="open">Menu</div>

<!-- Not in the DOM when closed -->
<div @if="open">Dialog</div>
```

Prefer `@show` when you need to keep DOM identity (focus, scroll position, input values, expensive subtrees). Prefer `@if` when inactive content should not exist or run work.

---

## Nested Content

Content under `@show` is bound with the rest of the template and stays bound while the parent component is mounted:

```html
<div @show="showForm">
  <input @bind="name" @ref="nameInput" />
  <button @on="click=submit">Submit</button>
</div>
```

Refs and listeners remain available whether the element is visible or not. Use `@if` if you need bindings and nested components only while the content is active.

---

## Behavior

`@show`:

- Evaluates the expression in a reactive effect  
- Sets `elem.hidden = !visible`  
- Does not insert or remove the element  
- Rejects quoted string conditions (with a warning)  
- Removes the `@show` attribute after setup  
- Disposes the effect when the component scope is cleaned up  

---

## Syntax Summary

| Form | Behavior |
|------|----------|
| `@show="condition"` | Show when truthy; hide when falsy |
| Quoted condition | Invalid |
| Truthy result | `hidden = false` |
| Falsy result | `hidden = true` |

---

## Constraints

| Rule | Detail |
|------|--------|
| Always mounted | Visibility only; no structural mount/unmount |
| Single condition | No `@elseif` / `@else` |
| Template DSL | Not arbitrary JavaScript |
| Reactivity | Re-runs when tracked dependencies change |
| Runtime attribute | `@show` is removed after binding |

---

## Minimal Example

```js
import { createComponent, html, render } from "udodi";

const Panel = createComponent({
  name: "Panel",

  state() {
    return { visible: true };
  },

  methods: {
    toggle() {
      this.visible = !this.visible;
    },
  },

  template: () => html`
    <div>
      <button @on="click=toggle">Toggle</button>
      <p @show="visible">Hello</p>
    </div>
  `,
});

render(Panel(), "#app");
```

---

## Next Steps

* [`@if`](./if.md) — mount and unmount conditional content  
* [`@ref`](./ref.md) — refs on elements that stay in the DOM  
* [`@bind`](./bind.md) — form values inside always-mounted panels  
* [Template DSL](./dsl.md) — condition expressions  
* [Template Overview](./overview.md) — how directives fit together  
