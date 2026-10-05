# `@for`

The `@for` directive renders repeated content from an array.

The element declaring `@for` is used as a template. Udodi clones it for each item, creates a per-item context, binds the cloned subtree, and reconciles the rendered items when the array changes.

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

  template: html`
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

## Template Root

The element declaring `@for` is used as the template root. Udodi clones it for each iteration, creates the per-item scope, and then processes the cloned root as a normal bound element.

`@for` is removed from each clone. `@key` is consumed by list reconciliation and is also removed before the clone is bound. Other non-conflicting directives on the root remain active and are evaluated in the iteration context.

For example, a directive can be placed directly on the repeating root:

```html
<tr
  @for="row index data"
  @key="row.id"
  @class="isSelected:row.id=>'selected'"
  @on="click=select:row.id"
>
  <td @text="row.name"></td>
</tr>
```

The conditional expression above uses a method as its condition. The condition must resolve to a boolean value, while the right-hand expression is evaluated when the condition is true. For example, `isSelected:row.id` can return whether the current row is selected. This follows the normal Udodi template DSL and does not use JavaScript operators or ternary syntax.

Native HTML attributes on the template root are also preserved normally:

```html
<li
  @for="item items"
  class="list-item"
  data-type="item"
  aria-label="List item"
>
  <span @text="item"></span>
</li>
```

The following structural directives cannot coexist with `@for` on the same root:

- `@if`
- `@elseif`
- `@else`
- `@teleport`

If any of these directives is placed on the `@for` root, Udodi removes it and emits a warning. Move the directive into the repeated content when conditional or teleported content is required.

For example:

```html
<!-- Valid: @if is inside the repeated content -->
<li @for="item items">
  <span @if="item.visible" @text="item.name"></span>
</li>

<!-- Invalid: @if competes with @for on the same root -->
<li @for="item items" @if="item.visible">
  <span @text="item.name"></span>
</li>
```

This restriction applies only to structural directives that conflict with the `@for` template root. Ordinary directives such as `@class`, `@on`, `@bind`, `@ref`, and other supported DOM bindings can be used directly on the repeating root.

## Reconciliation

When the array changes, Udodi reconciles the rendered records by key:

1. **Create**: clone the template, create an item scope, and bind the cloned subtree.  
2. **Reuse**: update the item and index signals while preserving the existing DOM and bindings.  
3. **Reorder**: move existing DOM nodes into the new array order.  
4. **Remove**: unmount records whose keys are no longer present.  
5. **Cleanup**: dispose all item scopes when the parent component is destroyed.  

An internal comment anchor preserves the list's insertion position.

## Nested Content

Normal template content and nested components can be used inside an `@for` item:

```html
<li @for="todo todos" @key="todo.id">
  <input @bind="todo.title" />
  <button @on="click=remove:todo.id">Remove</button>
</li>
```

Nested structural directives can also be processed within the cloned subtree, allowing constructs such as nested `@for` and `@if`.

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

  template: html`
    <ul>
      <li @for="name names">
        <span @text="name"></span>
      </li>
    </ul>
  `,
});

render(Names(), "#app");
```
