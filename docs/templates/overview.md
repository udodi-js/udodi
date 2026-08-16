# Template Overview

Udodi templates define component markup using HTML and a small declarative directive language.

A template describes the DOM structure of a component. Udodi directives, identified by the `@` prefix, connect that markup to component state, events, conditional rendering, lists, attributes, styling, and DOM references.

Templates are designed to remain close to HTML while providing the reactive behavior needed to build interactive interfaces.

---

## Templates in Components

A component defines its markup through the `template` option.

The `html` helper is the recommended way to write templates:

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
    <div>
      <p>Hello, <span @text="userName"></span></p>
    </div>
  `,
});

render(Greeting(), "#app");
```

The template remains ordinary HTML, with Udodi directives added where dynamic behavior is required.

A component template must produce exactly one root element when mounted.

---

## Directives

Udodi directives are HTML attributes whose names begin with `@`.

For example:

```html
<button @on="click=save">
  Save
</button>
```

The directive connects the DOM event to the component's `save` method.

Udodi provides directives for common UI operations:

| Directive | Purpose |
|-----------|---------|
| [`@text`](./text.md) | Bind an element's text content |
| [`@bind`](./bind.md) | Bind form control values to component data |
| [`@on`](./on.md) | Handle DOM events |
| [`@ref`](./ref.md) | Register a DOM element reference |
| [`@if`](./if.md) | Conditionally render content |
| [`@show`](./show.md) | Toggle element visibility |
| [`@for`](./for.md) | Render repeated content |
| [`@class`](./class.md) | Manage element classes |
| [`@style`](./style.md) | Manage inline styles |
| [`@attr`](./attr.md) | Bind element attributes |
| [`@teleport`](./teleport.md) | Render content at another DOM target |

Form-specific directives such as `@form`, `@validate`, and `@submit` are documented under [Forms](../forms/).

---

## Template Expressions

Directive values are evaluated against the component's internal context.

This allows templates to access values exposed by the component, including state, computed values, methods, props, and standard library helpers provided by the template runtime.

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

In this example:

- `userName` resolves to the component's state value.
- `capitalise` is a standard library helper.
- The `|` pipeline operator passes the value of `userName` through capitalise. `@text` renders the resulting value as the element's text content.

The expression:

```html
userName | capitalise
```

therefore reads the `userName` value and transforms it before rendering.

More complex expression syntax, including the supported operators and
pipeline syntax, is documented in [Template DSL](./dsl.md).

---

## Reactive Bindings

Directives that read reactive values can update the DOM when those values change.

For example:

```js
const Counter = createComponent({
  name: "Counter",

  state() {
    return {
      count: 0,
    };
  },

  template: () => html`
    <span @text="count"></span>
  `,
});
```

When `count` changes, the `@text` binding updates the element's text content.

This is part of Udodi's fine-grained reactive model. A reactive binding tracks the values it reads rather than requiring the entire component template to be rendered again.

See [Reactivity](../reactivity/README.md) for the underlying reactive system.

---

## Text Content

Use `@text` when an element's text content should come from a template expression:

```html
<span @text="userName"></span>
```

The value is evaluated reactively and applied to the element's `textContent`.

For static text, use normal HTML:

```html
<span>Hello</span>
```

Use `@text` when the content depends on component data.

See [`@text`](./text.md).

---

## Form Binding

Use `@bind` when a form control should stay synchronized with a component value:

```html
<input @bind="userName" />
```

The binding connects the control to the corresponding component path.

Nested paths can also be used:

```html
<input @bind="user.name" />
```

The runtime handles the appropriate value behavior for supported form controls, including text inputs, checkboxes, and radio buttons.

See [`@bind`](./bind.md) for the supported control types and binding behavior.

---

## Events

Use `@on` to connect DOM events to component methods.

For example:

```js
methods: {
  save() {
    // application logic
  },
},
```

```html
<button @on="click=save">
  Save
</button>
```

The event expression identifies the DOM event and the component handler that should be invoked.

`@on` also supports event modifiers and handler arguments. See [`@on`](./on.md) for the complete event syntax.

---

## Conditional Rendering

Udodi provides `@if`, `@elseif`, and `@else` for conditional rendering.

```html
<div @if="loading">
  Loading...
</div>

<div @elseif="error">
  Unable to load the data.
</div>

<div @else>
  Content
</div>
```

The conditional branches form a single chain. The runtime evaluates the conditions and renders the branch whose condition matches.

Use conditional rendering when the presence of the content itself should depend on application state.

See [`@if`](./if.md).

---

## Conditional Visibility

Use `@show` when an element should remain mounted while its visibility changes.

```html
<div @show="menuOpen">
  Menu
</div>
```

`@show` controls the element's `hidden` state rather than conditionally creating and destroying the element.

This makes `@show` useful when the DOM element should remain available while its visibility changes.

See [`@show`](./show.md).

---

## Rendering Lists

Use `@for` to render repeated content from a collection.

Supported forms:

```html
<!-- item and collection -->
<li @for="item items">
  <span @text="item"></span>
</li>

<!-- item, index, and collection -->
<li @for="item index items">
  <span @text="index"></span>
  <span @text="item"></span>
</li>
```

`item` and optional `index` are loop-local names. `items` is any expression that evaluates to an array.

An optional `@key` can provide stable identity for reconciliation. List-specific syntax and behavior are documented in [`@for`](./for.md).

---

## Classes and Styles

Use `@class` and `@style` when classes or inline styles need to respond to template values.

### Classes
Static quoted class lists, or dynamic bindings using conditionals and expressions that return a string class list, or array class list:

```html
<!-- static (applied once) -->
<div @class="'panel elevated'"></div>

<!-- dynamic: conditionally adds "active" and resolves sizeClass -->
<div
  class="panel"
  @class="isActive=>'active' sizeClass"
>
  Content
</div>
```

### Inline styles
Static CSS declaration string, or dynamic bindings that return a CSS string, object, or array of pairs:

```html
<!-- static -->
<div @style="'opacity:0.5;color:red'"></div>

<!-- dynamic (binding evaluates to style payload) -->
<div @style="boxStyles"></div>
```

Normal HTML attributes remain appropriate for static values:

```html
<div class="panel">
  Content
</div>
```

For component-owned CSS, use the component's `style` option instead:

```js
style: css`
  .panel {
    padding: 1rem;
  }
`,
```

Use:

- `style` for component CSS  
- `@class` for reactive class changes  
- `@style` for reactive inline style changes  

See [`@class`](./class.md), [`@style`](./style.md), and [Component Styles](../fundamentals/styles.md).

---

## Attributes

Use `@attr` when HTML attributes need to be controlled by template expressions.

Bindings are space-separated `name=expression` pairs:

```html
<input @attr="disabled=isDisabled title=tooltip" />
<a @attr="href=url aria-label=label"></a>
```

Each expression may return a string, number, or boolean. `null`, `undefined`, or `""` removes the attribute contributed by that binding (restoring a base attribute if one existed).

Static attributes should remain ordinary HTML:

```html
<input disabled />
```

See [`@attr`](./attr.md).

---

## DOM References

Use `@ref` when component code needs direct access to a DOM element.

```html
<input @ref="query" />
```

The registered element can then be accessed through the component context:

```js
methods: {
  focusQuery() {
    this.refs.query?.focus();
  },
},
```

Refs are useful for imperative DOM operations such as focusing, measuring, or scrolling.

Prefer declarative directives when the behavior can be expressed directly in the template.

See [`@ref`](./ref.md).

---

## Teleporting Content

Use `@teleport` when content needs to be rendered into another DOM target.

This is useful for UI that needs to escape its normal DOM position, such as layered or overlay content.

See [`@teleport`](./teleport.md).

For higher-level modal and layered UI behavior, see [Overlay](../overlay/README.md).

---

## Nested Components

Udodi components can be composed inside other component templates.

A parent component can render child components as part of its template. Each component maintains its own state, context, lifecycle, and other component configuration.

Conceptually:

```text
Parent component
       │
       └── template
             │
             ├── parent DOM
             │
             └── child component
                    │
                    ├── child state
                    ├── child context
                    ├── child template
                    └── child lifecycle
```

Component inputs and live property bindings are documented in [Props](../fundamentals/props.md).

---

## Template and Reactivity

Templates are integrated directly with Udodi's fine-grained reactivity system.

A directive that depends on reactive data can establish a reactive binding:

```text
component state
       │
       ▼
template expression
       │
       ▼
directive binding
       │
       ▼
      DOM
```

When the relevant reactive value changes, the binding can update the affected DOM rather than requiring the complete component to be rendered again.

This is one of the main differences between Udodi's template model and component systems based primarily on whole-component re-rendering.

See [Reactivity Overview](../reactivity/overview.md).

---

## Template Lifecycle

At a high level, mounting a component template involves:

```text
Component
    │
    ▼
Template
    │
    ▼
DOM creation
    │
    ▼
Directive binding
    │
    ▼
Nested component mounting
    │
    ▼
Mounted DOM
    │
    ▼
Reactive updates
```

The template declares the desired structure and behavior. The runtime performs the DOM operations and establishes the bindings required to make that structure live.

When the component is unmounted, the runtime removes the resources associated with the mounted component, including directive and reactive cleanup.

See [Lifecycle](../fundamentals/lifecycle.md).

---

## Template Rules

### Single Root Element

A component template must produce exactly one root element when mounted.

Valid:

```js
template: () => html`
  <main>
    <h1>Hello</h1>
    <p>Content</p>
  </main>
`,
```

Invalid:

```js
template: () => html`
  <h1>Hello</h1>
  <p>Content</p>
`,
```

Wrap multiple top-level elements in a single parent element.

### HTML-First Markup

Templates use HTML as their primary markup language.

Udodi extends HTML with `@` directives instead of requiring a separate template component syntax.

### Declarative Behavior

Prefer expressing UI behavior through directives and component methods.

Use direct DOM access through `@ref` when imperative browser APIs are actually required.

---

## Template DSL

The template DSL defines the expression syntax used by directive values.

For example:

```html
<span @text="name"></span>
<button @on="click=save">Save</button>
<div @show="visible"></div>
```

The individual directives build on this expression system, but each directive has its own value semantics and syntax.

Do not assume that the syntax of one directive applies to another.

See [Template DSL](./dsl.md) for the expression language and directive expression rules.

---

## Where to Go Next

| Goal | Guide |
|------|--------|
| Understand template syntax | [Template DSL](./dsl.md) |
| Bind text content | [`@text`](./text.md) |
| Bind form controls | [`@bind`](./bind.md) |
| Handle DOM events | [`@on`](./on.md) |
| Access DOM elements | [`@ref`](./ref.md) |
| Conditionally render content | [`@if`](./if.md) |
| Toggle visibility | [`@show`](./show.md) |
| Render collections | [`@for`](./for.md) |
| Manage classes | [`@class`](./class.md) |
| Manage inline styles | [`@style`](./style.md) |
| Bind attributes | [`@attr`](./attr.md) |
| Teleport content | [`@teleport`](./teleport.md) |
| Understand component context | [Context](../fundamentals/context.md) |
| Understand reactivity | [Reactivity Overview](../reactivity/overview.md) |
| Build forms | [Forms](../forms/README.md) |
| Build modals and layered UI | [Overlay](../overlay/README.md) |

---

## Summary

Udodi templates combine standard HTML with a focused set of `@` directives.

Use templates to:

- describe component markup  
- bind reactive values to DOM content and properties  
- handle DOM events  
- conditionally render content  
- render collections  
- manage classes, styles, and attributes  
- access DOM elements when imperative access is required  
- compose components  

Start with the [Template DSL](./dsl.md) to understand template expressions, then use the individual directive guides for directive-specific syntax and behavior.
