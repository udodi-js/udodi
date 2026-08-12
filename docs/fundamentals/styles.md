# Component Styles

Components can declare CSS through the `style` option. Udodi scopes that CSS to the component’s DOM so styles stay local to the instance tree and do not leak into unrelated markup.

---

## Defining Styles

```js
import { createComponent, css, html, render } from "udodi";

const Card = createComponent({
  name: "Card",

  style: css`
    .card {
      padding: 1rem;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
    }

    .title {
      margin: 0 0 0.5rem;
      font-size: 1.125rem;
    }
  `,

  template: () => html`
    <article class="card">
      <h2 class="title">Hello</h2>
      <p>Body</p>
    </article>
  `,
});

render(Card(), "#app");
```

`style` is a string of CSS. The optional `css` tagged template is a pass-through helper for editor highlighting; it does not change runtime behavior.

---

## How Scoping Works

When a component defines non-empty `style`, the runtime:

1. Allocates a numeric **scope id** for that component definition path  
2. Registers the CSS once in a shared stylesheet buffer  
3. At mount, marks the component root with `ud-scope-start="<scopeId>"`  
4. Uses `ud-scope-end` markers so parent scopes do not style nested component trees incorrectly  

Registered CSS is wrapped in a CSS `@scope` block:

```css
@scope ([ud-scope-start="42"]) to ([ud-scope-end="42"]) {
  .card {
    padding: 1rem;
  }
}
```

Styles are flushed into a single `<style id="udodi-styles">` element in `document.head` when `render()` completes (and whenever new scopes have been registered).

```text
Component with style
        │
        ▼
createScopeId() + registerScope(scopeId, css)
        │
        ▼
Mount root
  ud-scope-start="<id>"
  optional ud-scope-end="<parentId>"
        │
        ▼
renderStyles() → <style id="udodi-styles">
```

---

## Writing Selectors

Inside `style`, write normal selectors for your markup. You do not prefix classes with the scope id yourself — `@scope` limits where the rules apply.

```js
style: css`
  /* Matches .title only inside this component's scope */
  .title {
    font-weight: 600;
  }

  button {
    cursor: pointer;
  }

  button:hover {
    opacity: 0.9;
  }
`,
```

Prefer classes over styling bare element tags when the component is composed inside larger pages, so intent stays clear even though scoping already limits matches.

---

## Nested Components

Each component with `style` gets its own scope id. Parent scopes are bounded so rules do not apply inside a child component’s root the way a global stylesheet would.

```js
const Child = createComponent({
  name: "Child",
  style: css`
    .label {
      color: blue;
    }
  `,
  template: () => html`<span class="label">Child</span>`,
});

const Parent = createComponent({
  name: "Parent",
  style: css`
    .label {
      color: red;
    }
  `,
  template: () => html`
    <div>
      <span class="label">Parent</span>
      ${Child()}
    </div>
  `,
});
```

The parent’s `.label { color: red }` applies to the parent’s span. The child’s label is governed by the child’s scope.

---

## Empty or Missing Styles

- Omit `style`, or pass `""`, when the component has no CSS.  
- No scope id is created for empty style.  
- Duplicate registration of the same scope id is ignored.

---

## Global Styles

Component `style` is for **component-local** rules. Shared or app-wide CSS still belongs in your normal stylesheets (imported in the app entry, linked from HTML, etc.).

Use component styles when:

- The rules are tied to this component’s markup  
- You want isolation without CSS Modules or Shadow DOM  

Use global styles when:

- Tokens, resets, and layout shells are shared  
- Third-party or design-system CSS applies app-wide  

---

## Dynamic Styling

Component `style` is static per definition (registered CSS text). For values that change with state, use template bindings:

```html
<div
  class="box"
  @class="'active':isActive"
  @style="opacity:opacity"
></div>
```

| Approach | Use for |
| -------- | ------- |
| `style: css\`…\`` | Structural, component-owned CSS |
| `@class` | Toggling classes from state/computed |
| `@style` | Inline style properties from state/computed |

See [Templates](../templates/) for `@class` and `@style` directives.

---

## Example: Card with Variants via Class

```js
import { createComponent, css, html, render } from "udodi";

const Card = createComponent({
  name: "Card",

  state() {
    return {
      featured: false,
    };
  },

  methods: {
    toggle() {
      this.featured = !this.featured;
    },
  },

  style: css`
    .card {
      padding: 1rem;
      border: 1px solid #ddd;
      border-radius: 8px;
    }

    .card.featured {
      border-color: #4f46e5;
      box-shadow: 0 0 0 1px #4f46e5;
    }
  `,

  template: () => html`
    <article class="card" @class="'featured':featured">
      <p>Content</p>
      <button @on="click=toggle">Toggle featured</button>
    </article>
  `,
});

render(Card(), "#app");
```

Static structure lives in `style`; the `featured` class is toggled reactively with `@class`.

---

## Constraints

| Constraint | Behavior |
| ---------- | -------- |
| `style` is a string | Use `css\`…\`` only as a highlighting helper |
| Non-empty style → scope id | Empty string skips scoping |
| One shared stylesheet buffer | Rules accumulate in `#udodi-styles` |
| Scoping via CSS `@scope` | Requires a browser that supports `@scope` |
| Not a substitute for design tokens | Put shared variables/resets in global CSS |

---

## Minimal Example

```js
import { createComponent, css, html, render } from "udodi";

const Hello = createComponent({
  name: "Hello",

  style: css`
    .hello {
      font-weight: 600;
    }
  `,

  template: () => html`
    <p class="hello">Hello</p>
  `,
});

render(Hello(), "#app");
```

---

## Next Steps

* [Components](./components.md) — `style` among other component options  
* [Lifecycle](./lifecycle.md) — when mount applies scope attributes  
* [Templates](../templates/) — `@class` and `@style` for dynamic styling  
* [CSS Scoping](../advanced/css-scoping.md) — deeper notes on `@scope` and boundaries  
* [Context](./context.md) — component context (not related to CSS scope ids)  
