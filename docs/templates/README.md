# Templates and Directives

Udodi templates are HTML-first and use a small declarative DSL for connecting markup to component state, events, and DOM behavior.

Templates remain close to standard HTML while Udodi directives provide reactive bindings, event handling, conditional rendering, list rendering, DOM references, attribute and style updates, and other UI behavior.

Form-specific directives such as `@form`, `@validate`, and `@submit` are
documented separately under [Forms](../forms/README.md).

---

## Guides

* [Template Overview](./overview.md)
* [Template DSL](./dsl.md)
* [`@text`](./text.md)
* [`@bind`](./bind.md)
* [`@on`](./on.md)
* [`@ref`](./ref.md)
* [`@if`](./if.md)
* [`@show`](./show.md)
* [`@for`](./for.md)
* [`@class`](./class.md)
* [`@style`](./style.md)
* [`@attr`](./attr.md)
* [`@teleport`](./teleport.md)

**Start here → [Template Overview](./overview.md)**

---

## Templates in a Component

A component's `template` defines the DOM structure rendered by the component.

```js
import { createComponent, html, render } from "udodi";

const Hello = createComponent({
  name: "Hello",

  state() {
    return {
      userName: "Celestine",
    };
  },

  template: () => html`
    <p>
      Hello, <span @text="userName"></span>
    </p>
  `,
});

render(Hello(), "#app");
```

Templates can access values exposed through the component's public context, including state, computed values, methods, and props.

See [Context](../fundamentals/context.md) for the complete context model.

---

## Directive Map

| Directive | Role |
|-----------|------|
| [`@text`](./text.md) | Reactive text content |
| [`@bind`](./bind.md) | Two-way binding for form controls |
| [`@on`](./on.md) | Event listeners |
| [`@ref`](./ref.md) | Named DOM element references |
| [`@if`](./if.md) / [`@elseif`](./if.md) / [`@else`](./if.md) | Conditional DOM presence |
| [`@show`](./show.md) | Conditional visibility (`hidden`) |
| [`@for`](./for.md) | List rendering |
| [`@class`](./class.md) | Static and reactive class lists |
| [`@style`](./style.md) | Static and reactive inline styles |
| [`@attr`](./attr.md) | Reactive attributes |
| [`@teleport`](./teleport.md) | Render content into another DOM target |

---

## Template Model

```text
  template
     │
     ▼
  lexer / parser
     │
     ▼
  compiler
     │
     ▼
  instructions
     │
     ▼
    VM
     │
     ▼
  live DOM
```

The compiler and VM are internal implementation details. Application code
normally interacts with the template DSL rather than these runtime layers.

Reactive directives establish dependencies on the values they read, allowing
Udodi to update the affected DOM when those values change.

See [Reactivity](../reactivity/README.md) for the underlying reactive system.

---

## Design Notes

- **HTML-first** — templates look like HTML with a small set of `@` attributes.
- **Fine-grained updates** — bindings subscribe to the values they read, not whole components.
- **Explicit directives** — text, classes, styles, attributes, and events each have a dedicated directive.
- **One root element** — a component template must produce exactly one root element at mount time.
- **Forms elsewhere** — validation and submit flows live under [Forms](../forms/README.md), not in this section.

---

## When to Use Which Guide

| Goal | Guide |
|------|--------|
| Big picture and mental model | [Template Overview](./overview.md) |
| Expression syntax and DSL rules | [Template DSL](./dsl.md) |
| Display reactive text | [`@text`](./text.md) |
| Two-way inputs | [`@bind`](./bind.md) |
| Clicks and other events | [`@on`](./on.md) |
| Hold a DOM node on the component | [`@ref`](./ref.md) |
| Mount / unmount by condition | [`@if`](./if.md) |
| Toggle visibility without destroying DOM | [`@show`](./show.md) |
| Render lists | [`@for`](./for.md) |
| Toggle classes from state | [`@class`](./class.md) |
| Set inline styles from state | [`@style`](./style.md) |
| Bind arbitrary attributes | [`@attr`](./attr.md) |
| Render into another part of the document | [`@teleport`](./teleport.md) |

---

## Next Steps

* [Template Overview](./overview.md) — start here  
* [Template DSL](./dsl.md) — expression and directive syntax  
* [Reactivity Overview](../reactivity/overview.md) — how bindings stay in sync  
* [Components](../fundamentals/components.md) — where `template` lives on a component  
* [Forms](../forms/README.md) — `@form`, `@validate`, `@submit`  
