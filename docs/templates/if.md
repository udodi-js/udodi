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

Whitespace and other non-element nodes do not break the chain; discovery walks `nextElementSibling`.

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
<div @if="greater:count:0">
  <span @text="count"></span>
</div>
```

Here, `greater:count:0` evaluates to the result of `greater(count, 0)`. When `count` changes from `0` to a positive value, the condition becomes truthy and the element is mounted. When it changes back to `0` or below, the condition becomes falsy and the element is removed.

Quoted string literals are not valid conditions.

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

## How Branch Mounting Works

For each branch in the chain, Udodi keeps a **template clone** of the branch markup (without the conditional attribute).

When a branch becomes active:

1. A fresh instance is cloned from that template.  
2. Nested components in the instance are resolved.  
3. Directives on the instance are bound under a **branch scope**.  
4. The instance is inserted before an internal comment anchor.  

When the active branch changes or becomes inactive:

1. The branch scope is cleaned up (effects, listeners, related cleanups).  
2. The instance is removed from the DOM.  

If the same branch remains selected, the DOM is left unchanged. This means each activation of a branch starts from a clean instance.

---

## `@if` vs `@show`

Both directives respond reactively to a condition, but they have different DOM semantics.

| | `@if` | `@show` |
|--|-------|---------|
| DOM presence | Mounted conditionally | Always mounted |
| Visibility | Element exists only when matched | Uses the element's `hidden` state |
| Subtree lifecycle | Created and removed per activation | Remains mounted |
| DOM identity | New instance when the branch mounts | Preserved |
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

When the branch is mounted, its contents are bound on that branch instance.

When the branch is removed, the branch scope is cleaned up and the instance is detached.

This also applies to nested components:

```html
<section @if="showProfile">
  ${Profile()}
</section>
```

The nested component is mounted when the branch becomes active and cleaned up when the branch becomes inactive.

---

## Refs in Conditional Branches

`@ref` registers an element when that element is processed as part of a mounted branch instance.

If the element lives inside conditional content, the ref is available after that branch has been mounted and bound:

```html
<div @if="editing">
  <input @ref="nameInput" />
</div>
```

```js
methods: {
  focusInput() {
    this.refs.nameInput?.focus();
  },
},
```

When the branch is not active, do not assume the ref points at a connected element. Prefer optional chaining, and when necessary check `isConnected` before imperative DOM calls.

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

Only the branch selected by the current conditions is rendered. Switching always unmounts the previous instance before mounting the next.

---

## Behavior

`@if`:

- Discovers an adjacent `@if` / `@elseif` / `@else` chain  
- Stores a template clone per branch  
- Evaluates conditions reactively in order  
- Mounts a fresh instance of the first matching branch (or `@else`)  
- Binds directives under a per-activation branch scope  
- Unmounts and cleans up the previous instance when the selection changes  
- Leaves the DOM unchanged when the same branch stays selected  
- Uses a comment anchor as the insertion point  
- Removes conditional attributes during setup  
- Disposes the chain effect and anchor when the owning component scope is disposed  

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
| DOM behavior | Inactive branches are removed; active branches are fresh instances |
| Quoted conditions | Invalid |

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
* [Lifecycle](../fundamentals/lifecycle.md) — component and subtree cleanup  
