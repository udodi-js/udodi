# `@ref`

The `@ref` directive gives a component a direct reference to a DOM element through its `refs` object.

Use `@ref` when application logic needs access to the actual DOM element for an imperative operation such as focusing an input, measuring an element, scrolling, or integrating with a DOM-based library.

---

## Basic Usage

Assign a name to an element with `@ref`:

```html
<input @ref="query" />
```

The element is then available through the component context:

```js
methods: {
  focusQuery() {
    this.refs.query?.focus();
  },
},
```

Refs are available through `this.refs` in methods and `ctx.refs` in lifecycle hooks.

---

## Ref Names

The value of `@ref` is a literal ref name.

A bare name can be used directly:

```html
<input @ref="query" />
```

A quoted string is also accepted:

```html
<input @ref="'query'" />
```

Both forms register the element under the same key:

```js
this.refs.query;
```

The value is **not** evaluated as a template expression.

For example, this does not resolve a state property:

```html
<!-- "inputRef" is used literally as the ref name -->
<input @ref="inputRef" />
```

It is equivalent to:

```js
this.refs.inputRef;
```

It does **not** mean:

```js
this.refs[this.inputRef];
```

If the ref name is empty, Udodi warns and does not register the element.

---

## Accessing Refs

Refs are exposed through the component's public context:

```js
methods: {
  focusInput() {
    this.refs.input?.focus();
  },

  measurePanel() {
    const panel = this.refs.panel;

    if (!panel) {
      return;
    }

    return panel.getBoundingClientRect();
  },
},
```

You can also access refs from lifecycle hooks:

```js
onMount(root, ctx) {
  ctx.refs.input?.focus();
},
```

`onMount` runs after the template has been bound and mounted, so refs registered by the component template are available at that point.

---

## Example

```js
import { createComponent, html, render } from "udodi";

const Search = createComponent({
  name: "Search",

  state() {
    return {
      query: "",
    };
  },

  methods: {
    focusInput() {
      this.refs.input?.focus();
    },

    clear() {
      this.query = "";
      this.refs.input?.focus();
    },
  },

  onMount(root, ctx) {
    ctx.refs.input?.focus();
  },

  template: () => html`
    <div>
      <input @ref="input" @bind="query" />

      <button @on="click=clear">
        Clear
      </button>

      <button @on="click=focusInput">
        Focus
      </button>
    </div>
  `,
});

render(Search(), "#app");
```

The input is registered as:

```js
ctx.refs.input;
```

and can be used by methods or lifecycle logic.

---

## Multiple Refs

A component can register any number of named refs:

```html
<input @ref="email" />
<input @ref="password" />

<button @ref="submitButton">
  Submit
</button>
```

They are exposed independently:

```js
this.refs.email;
this.refs.password;
this.refs.submitButton;
```

A common pattern is to use refs for a small number of elements that require imperative DOM operations:

```js
methods: {
  focusEmail() {
    this.refs.email?.focus();
  },

  focusPassword() {
    this.refs.password?.focus();
  },
},
```

---

## Duplicate Ref Names

Ref names are keys in the component's `refs` object.

If multiple elements use the same ref name, the later registration overwrites the previous value:

```html
<input @ref="field" />
<textarea @ref="field"></textarea>
```

After the template is processed:

```js
this.refs.field;
```

refers to the element registered last.

For predictable behavior, give each element that requires a ref its own name.

---

## Refs and Conditional Content

Refs are registered when their elements are processed by the DOM binding system.

This means refs can be used with conditionally mounted content, but the application should account for the fact that the element may not exist:

```html
<input @if="editing" @ref="editInput" />
```

Access the ref defensively:

```js
methods: {
  focusEditor() {
    this.refs.editInput?.focus();
  },
},
```

When conditional content is removed, do not assume that a previously stored ref has automatically been reset. A ref is a direct entry in the component's `refs` object; it is not a reactive DOM-query mechanism.

If the referenced element may no longer be present, verify that it is still connected before using it when necessary:

```js
const input = this.refs.editInput;

if (input?.isConnected) {
  input.focus();
}
```

---

## Refs Are Not Reactive

`@ref` does not create a reactive effect.

Registering a ref:

```html
<input @ref="input" />
```

does not cause code to react when the DOM element changes.

The ref simply provides access to the registered element:

```js
this.refs.input;
```

If the element's state should be driven reactively, use the appropriate directive instead:

```html
<input
  @ref="input"
  @bind="query"
/>
```

Here:

- `@ref` provides imperative access to the DOM node.  
- `@bind` synchronizes the input with component state.  

---

## When to Use `@ref`

Use `@ref` when you need an actual DOM element.

| Use `@ref` for | Prefer declarative APIs for |
|----------------|-----------------------------|
| Calling `.focus()` or `.blur()` | Form value synchronization with `@bind` |
| Measuring layout | Displaying values with `@text` |
| Calling `.scrollIntoView()` | Conditional visibility with `@show` |
| Reading DOM measurements | Conditional DOM presence with `@if` |
| Selecting or manipulating DOM state | Event handling with `@on` |
| Integrating DOM-based libraries | Reactive classes with `@class` |
| Integrating third-party widgets | Reactive styles with `@style` |

For example, focusing an input is an appropriate use of a ref:

```js
methods: {
  focusSearch() {
    this.refs.search?.focus();
  },
},
```

Whereas changing an element's class based on state should normally use `@class`:

```html
<div @class="isActive=>'active'"></div>
```

Use `@ref` as an imperative escape hatch, not as the primary mechanism for expressing reactive UI behavior.

---

## Refs and Lifecycle

Refs are registered during template binding.

The mounting sequence makes them available before the component's `onMount` callback runs:

```text
Create template DOM
       │
       ▼
Resolve nested components
       │
       ▼
Bind directives
       │
       ├── register @ref entries
       ├── create reactive bindings
       └── register event listeners
       │
       ▼
Register component root
       │
       ▼
Insert component into the container
       │
       ▼
onMount(root, ctx)
```

Therefore, a ref can safely be accessed from `onMount`:

```js
onMount(root, ctx) {
  ctx.refs.input?.focus();
},
```

The lifecycle hook receives the component root as its first argument and the public component context as its second argument.

---

## Ref Registration

Conceptually, the runtime performs the equivalent of:

```js
context.refs[name] = element;
```

For example:

```html
<input @ref="email" />
```

results in:

```js
ctx.refs.email = /* the input element */;
```

The runtime then removes the `@ref` attribute from the live DOM.

The directive therefore does not remain as a custom attribute after it has been processed.

---

## Behavior

`@ref`:

- Reads the directive value as a literal ref name.  
- Accepts either a bare name or a quoted string.  
- Stores the element in `context.refs` under that name.  
- Warns when the ref name is empty.  
- Removes the `@ref` attribute after successful registration.  
- Does not create a reactive effect.  
- Does not evaluate the ref name against component state.  

The operation is intentionally simple: it establishes a named reference from the component context to a DOM element.

---

## `@ref` vs DOM Queries

Prefer `@ref` when the element belongs to the component and you already know which element you need.

Instead of:

```js
document.querySelector(".search-input");
```

use:

```html
<input @ref="searchInput" />
```

and:

```js
this.refs.searchInput;
```

This keeps the DOM relationship inside the component rather than coupling application logic to global selectors.

It also avoids relying on class names or other presentation-oriented attributes as DOM lookup identifiers.

---

## `@ref` vs `@bind`

These directives solve different problems:

| | `@ref` | `@bind` |
|--|--------|---------|
| Purpose | Access the DOM element | Synchronize a form control with state |
| Direction | Component → DOM reference | State ↔ DOM value |
| Reactive | No | Yes |
| Result | DOM element | Bound state value |
| Typical use | Focus, measure, scroll | Inputs, checkboxes, radios |

They can be used together:

```html
<input
  @ref="searchInput"
  @bind="query"
/>
```

Then:

```js
this.refs.searchInput?.focus();
```

handles imperative DOM access while:

```html
@bind="query"
```

handles value synchronization.

---

## `@ref` vs `@on`

`@ref` provides access to an element; `@on` responds to events.

They are often useful together:

```html
<button
  @ref="button"
  @on="click=handleClick"
>
  Save
</button>
```

```js
methods: {
  handleClick(event) {
    console.log(event.currentTarget);
  },

  focusButton() {
    this.refs.button?.focus();
  },
},
```

Use `@on` when the application needs to react to an event. Use `@ref` when application logic needs the DOM element itself.

---

## Syntax Summary

| Form | Behavior |
|------|----------|
| `@ref="input"` | Registers the element as `refs.input` |
| `@ref="'input'"` | Registers the element as `refs.input` |
| `@ref="someState"` | Uses `"someState"` literally; it does not evaluate the state value |
| Empty ref name | Warning; element is not registered |
| Duplicate name | Later registration replaces the previous ref |
| `@ref` after processing | Attribute is removed from the element |

---

## Constraints

| Rule | Detail |
|------|--------|
| Literal name | The ref value is a name, not a reactive expression |
| Bare or quoted | Both `@ref="input"` and `@ref="'input'"` are supported |
| Reactive | `@ref` does not create a reactive effect |
| Duplicate names | The last registration wins |
| Empty names | Warned and ignored |
| Conditional elements | The referenced element may not exist |
| DOM access | Use `refs` for imperative DOM operations |
| Runtime attribute | `@ref` is removed after successful registration |

---

## Minimal Example

```js
import { createComponent, html, render } from "udodi";

const Search = createComponent({
  name: "Search",

  methods: {
    focus() {
      this.refs.input?.focus();
    },
  },

  template: () => html`
    <div>
      <input @ref="input" />
      <button @on="click=focus">
        Focus
      </button>
    </div>
  `,
});

render(Search(), "#app");
```

The component can access the input directly through:

```js
this.refs.input;
```

---

## Next Steps

* [`@on`](./on.md) — respond to DOM events  
* [`@bind`](./bind.md) — synchronize form controls with state  
* [`@if`](./if.md) — conditionally mount DOM content  
* [`@show`](./show.md) — conditionally show or hide an element  
* [Lifecycle](../fundamentals/lifecycle.md) — work with `onMount` and `onUnmount`  
* [Context](../fundamentals/context.md) — understand `refs` on the component context  
* [Template Overview](./overview.md) — understand how directives fit into the template system  
