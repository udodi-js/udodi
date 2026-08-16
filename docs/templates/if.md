# `@if`

The `@if` directive conditionally renders an element based on a reactive expression.

When the condition is truthy, the element is mounted. When the condition becomes falsy, the element is removed. `@if` also supports `@elseif` and `@else` for conditional branches.

Use `@if` when content should be **created and removed** as its condition changes. When the element should remain mounted and only its visibility should change, use [`@show`](./show.md).

---

## Basic Usage

```html
<div @if="loading">Loading...</div>
```

When `loading` is truthy, the element is present in the DOM.

When `loading` becomes falsy, the element is removed.

Because the condition is reactive, the DOM is updated automatically when its dependencies change.

---

## Conditional Chains

`@if` can be followed by `@elseif` and `@else` branches:

```html
<div @if="loading">Loading...</div>
<div @elseif="error">Unable to load.</div>
<div @else>Content</div>
```

The runtime evaluates the branches in order and renders only the first matching branch.

A chain can contain:

- One `@if`  
- Zero or more `@elseif` branches  
- Zero or one `@else` branch  

`@else` is the fallback branch and does not take an expression.

```html
<div @if="loading">Loading...</div>
<div @elseif="error">Error</div>
<div @else>Ready</div>
```

If `loading` is truthy, only the first branch is rendered.

If `loading` is falsy and `error` is truthy, only the `@elseif` branch is rendered.

If neither condition is truthy, the `@else` branch is rendered.

---

## Branch Adjacency

Branches belonging to the same chain must be adjacent element siblings.

```html
<!-- Valid -->
<div @if="loading">Loading...</div>
<div @elseif="error">Error</div>
<div @else>Ready</div>
```

An intervening element breaks the chain:

```html
<!-- Not a single conditional chain -->
<div @if="loading">Loading...</div>
<p>Some content</p>
<div @else>Ready</div>
```

`@elseif` and `@else` must therefore directly follow the branch they belong to.

---

## Expressions

`@if` and `@elseif` use template expressions.

The result is evaluated as a condition:

```html
<div @if="ready">Ready</div>

<div @if="hasItem">
  Items available
</div>

<div @if="user">
  Signed in
</div>
```

The condition is evaluated reactively. When a reactive value used by the condition changes, Udodi re-evaluates the condition and updates the active branch when necessary.

For example, a component can provide a user-defined function such as `greater` to express the condition:

```js
methods: {
  greater(value, threshold) {
    return value > threshold;
  },
},
```

The function can then be used from the template:

```html
<div @if="greater:count:0"> // or @if="count | greater:0"
  <span @text="count"></span>
</div>
```

Here, `greater:count:0` evaluates to the result of `greater(count, 0)`. When `count` changes from `0` to a positive value, the condition becomes truthy and the element is mounted. When it changes back to `0` or below, the condition becomes falsy and the element is removed.

See [Template DSL](./dsl.md) for expression syntax and supported expressions.

---

## Example

```js
import { createComponent, html, render } from "udodi";

const Panel = createComponent({
  name: "Panel",

  state() {
    return {
      loading: true,
      error: "",
      data: "",
    };
  },

  methods: {
    async load() {
      this.loading = true;
      this.error = "";

      try {
        this.data = await fetchData();
      } catch (error) {
        this.error = error.message;
      } finally {
        this.loading = false;
      }
    },
  },

  template: () => html`
    <section>
      <div @if="loading">
        Loading...
      </div>

      <div @elseif="error">
        <p @text="error"></p>
      </div>

      <div @else>
        <p @text="data"></p>
      </div>
    </section>
  `,
});

render(Panel(), "#app");
```

Only one branch is present at a time.

---

## `@if` vs `@show`

Both directives respond reactively to a condition, but they have different DOM semantics.

| | `@if` | `@show` |
|--|-------|---------|
| DOM presence | Mounted conditionally | Always mounted |
| Visibility | Element exists only when matched | Uses the element's `hidden` state |
| Subtree lifecycle | Created and removed | Remains mounted |
| DOM identity | Can change when branch changes | Preserved |
| Typical use | Conditional content | Temporarily hidden content |

For example:

```html
<div @if="open">
  Dialog content
</div>

<div @show="open">
  Menu content
</div>
```

With `@if`, the dialog content is removed when `open` becomes false.

With `@show`, the menu remains mounted and is hidden while `open` is false.

Use `@if` when the content should not exist while inactive.

Use `@show` when the content should remain mounted while being hidden.

See [`@show`](./show.md) for visibility-only behavior.

---

## Nested Content

The content of an `@if` branch can contain normal template markup and other directives:

```html
<div @if="showForm">
  <input @bind="userName" />
  <button @on="click=submit">
    Submit
  </button>
</div>
```

When the branch is mounted, its contents are bound normally.

When the branch is removed, its DOM and associated directive bindings are cleaned up with the branch.

This also applies to nested components:

```html
<section @if="showProfile">
  ${Profile()}
</section>
```

The nested component is mounted when the branch becomes active and removed when the branch becomes inactive.

---

## Refs in Conditional Branches

The `@ref` registers an element when the element is processed by the template runtime. If the element is part of conditionally rendered content, the availability of the ref therefore depends on whether that content has been mounted and processed.

For example:

```html
<div @if="editing">
  <input @ref="nameInput" />
</div>
```

Code that uses the ref should account for the element not being available:

```js
methods: {
  focusInput() {
    this.refs.nameInput?.focus();
  },
},
```

When the conditional content is not active, the corresponding element is not available in the DOM. When the content is mounted, its directives are processed and the ref becomes available.

See [`@ref`](./ref.md) for more information.

---

## Branch Switching

When the active condition changes, Udodi switches the rendered branch.

For example:

```html
<div @if="loading">Loading...</div>
<div @elseif="error">Error</div>
<div @else>Ready</div>
```

The possible states are:

```text
loading = true
    │
    ▼
┌─────────┐
│ Loading │
└─────────┘

loading = false, error = true
    │
    ▼
┌───────┐
│ Error │
└───────┘

loading = false, error = false
    │
    ▼
┌───────┐
│ Ready │
└───────┘
```

Only the branch selected by the current conditions is rendered.

---

## Behavior

`@if`:

- Evaluates its condition reactively.  
- Renders the element when the condition is truthy.  
- Removes the element when the condition becomes falsy.  
- Supports `@elseif` and `@else` branches.  
- Renders only the first matching branch in a chain.  
- Updates the rendered branch when its conditions change.  
- Supports normal directives and nested components inside branches.  
- Cleans up bindings associated with a removed branch.  

The `@if` attribute itself is a runtime directive and is not retained as normal application markup after binding.

---

## Syntax Summary

| Syntax | Behavior |
|--------|----------|
| `@if="condition"` | Conditionally render the element |
| `@elseif="condition"` | Render this branch when previous conditions are falsy |
| `@else` | Render when no previous branch matches |
| `@if` → `@elseif` → `@else` | Conditional branch chain |

Example:

```html
<div @if="isLoading">Loading...</div>
<div @elseif="isError">Error</div>
<div @else>Ready</div>
```

---

## Constraints

| Rule | Detail |
|------|--------|
| `@if` | Starts a conditional chain |
| `@elseif` | Must belong to a preceding `@if` chain |
| `@else` | Must belong to a preceding `@if` chain |
| Branch order | The first matching branch is rendered |
| `@else` | Does not take a condition |
| Adjacency | Chain branches must be adjacent element siblings |
| Reactivity | Conditions are re-evaluated when their dependencies change |
| DOM behavior | Inactive branches are removed rather than merely hidden |

---

## Minimal Example

```js
import { createComponent, html, render } from "udodi";

const Gate = createComponent({
  name: "Gate",

  state() {
    return {
      ready: false,
    };
  },

  methods: {
    toggle() {
      this.ready = !this.ready;
    },
  },

  template: () => html`
    <div>
      <button @on="click=toggle">
        Toggle
      </button>

      <p @if="ready">
        Ready
      </p>

      <p @else>
        Waiting...
      </p>
    </div>
  `,
});

render(Gate(), "#app");
```

---

## Next Steps

* [`@show`](./show.md) — keep elements mounted while controlling visibility  
* [`@for`](./for.md) — render lists reactively  
* [`@ref`](./ref.md) — reference elements inside conditional content  
* [`@bind`](./bind.md) — bind form controls inside conditional branches  
* [Template DSL](./dsl.md) — template expression syntax  
* [Template Overview](./overview.md) — understand the template system  
