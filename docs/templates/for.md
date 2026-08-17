# `@for`

The `@for` directive renders repeated content from an array.

The element declaring `@for` is used as a template. Udodi clones it for each item, creates a per-item context, binds the cloned subtree, and reconciles the rendered items when the array changes.

---

## Basic Usage

```html
<ul>
  <li @for="item items">
    <span @text="item"></span>
  </li>
</ul>
```

`@for` supports two forms:

```html
<li @for="item items">...</li>
<li @for="item index items">...</li>
```

| Token | Meaning |
|-------|---------|
| `item` | Loop-local name for the current item |
| `index` | Optional loop-local name for the numeric index |
| `items` | Expression that evaluates to an array |

For example:

```js
state() {
  return {
    items: ["Attamah", "Grace", "Lin"],
  };
}
```

---

## Example

```js
import { createComponent, html, render } from "udodi";

const TodoList = createComponent({
  name: "TodoList",

  state() {
    return {
      todos: [
        { id: 1, title: "Write docs" },
        { id: 2, title: "Ship" },
      ],
    };
  },

  methods: {
    add() {
      const id = Date.now();
      this.todos.push({ id, title: `Task ${id}` });
    },
  },

  template: () => html`
    <div>
      <button @on="click=add">Add</button>

      <ul>
        <li @for="todo index todos" @key="todo.id">
          <span @text="index"></span>
          <span @text="todo.title"></span>
        </li>
      </ul>
    </div>
  `,
});

render(TodoList(), "#app");
```

Here, `@for` and `@key` define the repeating template. The `@text` directives are descendants of that template and are therefore bound separately for each item.

---

## Syntax Rules

The directive must contain two or three space-separated tokens:

```html
<li @for="item items">...</li>
<li @for="item index items">...</li>
```

- `item` and `index` must be single identifiers.  
- The collection expression must not be a string literal.  
- The collection must evaluate to an `Array`.  
- A non-array value clears the rendered items.  

Invalid:

```html
<li @for="item of items"></li>
<li @for="user.name users"></li>
<li @for="'a' 'b'"></li>
```

---

## `@key`

`@key` provides stable identity during reconciliation:

```html
<li @for="todo todos" @key="todo.id">
  <span @text="todo.title"></span>
</li>
```

The expression must be a valid path and is evaluated in the iteration context, where the item and optional index variables are available.

Keys must be non-null and unique within the rendered array. Invalid or duplicate keys are skipped with a warning.

When `@key` is omitted, Udodi derives a fallback key. Objects use `id`, `_id`, or `key` when available; otherwise an index-based fallback is used with a warning. Primitive values use a `type/value/index` combination.

For lists that can be reordered, inserted into, or removed from, prefer an explicit `@key`.

---

## Iteration Context

Each rendered item receives a child context containing:

- the current item as a reactive signal  
- the optional index as a reactive signal  
- the parent component context  

```html
<li @for="todo index todos" @key="todo.id">
  <span @text="index"></span>
  <span @text="todo.title"></span>
  <button @on="click=remove:todo.id">Remove</button>
</li>
```

Parent state, methods, computed values, and props remain available through the inherited context.

---

## Template Root

The element declaring `@for` is a template definition, not a normal bound element.

`@for` and `@key` are removed from each clone. Any other directive placed directly on the template root is **ignored and removed with a warning**.

Put bindings on descendants instead:

```html
<!-- Correct -->
<li @for="item items">
  <span @text="item"></span>
</li>

<!-- Incorrect: @text on the @for root is ignored -->
<li @for="item items" @text="item"></li>
```

This restriction applies to all directives on the repeating root, not only `@text`.

---

## Reconciliation

When the array changes, Udodi reconciles the rendered records by key:

1. **Create** — clone the template, create an item scope, and bind the cloned subtree.  
2. **Reuse** — update the item and index signals while preserving the existing DOM and bindings.  
3. **Reorder** — move existing DOM nodes into the new array order.  
4. **Remove** — unmount records whose keys are no longer present.  
5. **Cleanup** — dispose all item scopes when the parent component is destroyed.  

An internal comment anchor preserves the list's insertion position.

---

## Nested Content

Normal template content and nested components can be used inside an `@for` item:

```html
<li @for="todo todos" @key="todo.id">
  <input @bind="todo.title" />
  <button @on="click=remove:todo.id">Remove</button>
</li>
```

Nested structural directives can also be processed within the cloned subtree, allowing constructs such as nested `@for` and `@if`.

---

## Behavior

`@for`:

- Requires an array result.  
- Re-evaluates reactively when the collection expression changes.  
- Creates a separate scope for each rendered item.  
- Preserves existing records when their keys are reused.  
- Updates item and index signals for reused records.  
- Reorders DOM nodes to match the array order.  
- Unmounts removed records and cleans up their scopes.  
- Replaces the original template element with an internal anchor.  

---

## Minimal Example

```js
import { createComponent, html, render } from "udodi";

const Names = createComponent({
  name: "Names",

  state() {
    return {
      names: ["Attamah", "Grace"],
    };
  },

  template: () => html`
    <ul>
      <li @for="name names">
        <span @text="name"></span>
      </li>
    </ul>
  `,
});

render(Names(), "#app");
```

---

## Next Steps

* [`@if`](./if.md) — conditional rendering  
* [Reactive Collections](../reactivity/collections.md) — array reactivity  
* [Using `touch()`](../reactivity/touch.md) — notifying deep mutations  
* [Template DSL](./dsl.md) — expression syntax  
* [Template Overview](./overview.md) — directive fundamentals  
