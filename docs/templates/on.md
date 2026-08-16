# `@on`

The `@on` directive attaches a DOM event listener to an element and evaluates a handler when the event occurs.

The **DOM `Event` object is passed as the first argument** to the handler. Additional arguments can be supplied using the `:` argument syntax.

Optional modifiers control event behavior, propagation, key filtering, and listener options.

---

## Basic Usage

```html
<button @on="click=save">Save</button>
```

The click event is passed to the `save` handler:

```js
methods: {
  save(event) {
    console.log(event.type); // "click"
  },
},
```

The event is always the first argument supplied by `@on`.

This makes the native DOM event directly available to component methods without requiring a separate event lookup mechanism.

---

## Event Arguments

The event object is passed first, followed by any arguments declared in the template.

For example:

```html
<button @on="click=select:item.id">
  Select
</button>
```

The corresponding method can receive:

```js
methods: {
  select(event, id) {
    console.log(event); // MouseEvent
    console.log(id);    // item.id
  },
},
```

The argument order is therefore:

```text
event, argument1, argument2, ...
```

For a handler without explicit arguments:

```html
<button @on="click=save">Save</button>
```

the method receives:

```js
methods: {
  save(event) {
    // event is the DOM Event
  },
},
```

---

## Syntax

Each event binding has the form:

```text
event[.modifier...]=handler[:argument...]
```

Examples:

```html
<button @on="click=save"></button>

<form @on="submit.prevent=save"></form>

<input @on="keydown.enter=search" />

<button @on="click=select:item.id"></button>
```

Multiple event bindings can be placed in the same `@on` attribute:

```html
<button @on="click=save keydown.enter=save">
  Save
</button>
```

Each binding is handled independently.

---

## Handlers

A handler resolves against the component context.

The normal form is a component method:

```js
methods: {
  save(event) {
    // application logic
  },
},
```

used as:

```html
<button @on="click=save">Save</button>
```

Arguments can be added with `:`:

```html
<button @on="click=select:item.id">
  Select
</button>
```

```js
methods: {
  select(event, id) {
    this.activeId = id;
  },
},
```

The event remains the first argument even when additional arguments are supplied.

---

## Passing Arguments

Arguments are specified after the handler using `:`:

```html
<button @on="click=select:item.id">
  Select
</button>
```

The runtime evaluates the argument expressions when the event occurs.

The handler receives the event first:

```js
methods: {
  select(event, id) {
    this.activeId = id;
  },
},
```

Multiple arguments can be supplied:

```html
<button @on="click=save:user.id:'profile'">
  Save
</button>
```

which corresponds conceptually to:

```js
save(event, user.id, "profile");
```

See [Template DSL](./dsl.md) for the supported expression and argument syntax.

---

## Event Object

The first handler argument is the native DOM event.

```html
<button @on="click=handleClick">
  Click
</button>
```

```js
methods: {
  handleClick(event) {
    console.log(event.type);
    console.log(event.target);
    console.log(event.currentTarget);
  },
},
```

For keyboard events:

```html
<input @on="keydown=handleKey" />
```

```js
methods: {
  handleKey(event) {
    console.log(event.key);
  },
},
```

For form submission:

```html
<form @on="submit=submit">
  ...
</form>
```

```js
methods: {
  submit(event) {
    event.preventDefault();
  },
},
```

For common event behavior such as preventing default browser actions, prefer the corresponding directive modifier when available:

```html
<form @on="submit.prevent=submit">
  ...
</form>
```

---

## Modifiers

Modifiers are appended to the event name using `.`:

```html
<form @on="submit.prevent=save"></form>

<div @on="click.self=close"></div>

<input @on="keydown.enter=submit" />
```

Modifiers are applied before the handler is evaluated.

### Behavior Modifiers

| Modifier | Effect |
|----------|--------|
| `prevent` | Calls `event.preventDefault()` |
| `stop` | Calls `event.stopPropagation()` |
| `self` | Runs only when `event.target` is the element carrying `@on` |
| `once` | Removes the listener after the first successful handler invocation |

#### `prevent`

Prevents the browser's default action:

```html
<form @on="submit.prevent=save">
  ...
</form>
```

This is equivalent in intent to calling `event.preventDefault()` inside the handler.

#### `stop`

Stops propagation:

```html
<div @on="click.stop=handleClick">
  ...
</div>
```

This applies `event.stopPropagation()` before the handler runs.

#### `self`

Runs the handler only when the event originated from the element itself:

```html
<div class="backdrop" @on="click.self=close">
  <div class="dialog">
    ...
  </div>
</div>
```

A click on `.dialog` does not trigger `close`. A click directly on `.backdrop` does.

#### `once`

Runs the handler once and then removes the listener:

```html
<button @on="click.once=initialize">
  Initialize
</button>
```

### Keyboard Modifiers

Keyboard modifiers restrict the handler to a particular key.

| Modifier | Required `event.key` |
|----------|----------------------|
| `enter` | `"Enter"` |
| `esc` | `"Escape"` |
| `space` | `" "` |
| `tab` | `"Tab"` |

Example:

```html
<input @on="keydown.enter=search" />
```

```js
methods: {
  search(event) {
    console.log(event.key); // "Enter"
  },
},
```

If the event's key does not match the modifier, the handler is not evaluated.

Keyboard modifiers are useful with `keydown`, `keyup`, and other keyboard events.

### Listener Options

The `passive` and `nonpassive` modifiers control the `passive` option supplied to `addEventListener`.

| Modifier | Listener option |
|----------|-----------------|
| `passive` | `{ passive: true }` |
| `nonpassive` | `{ passive: false }` |

Example:

```html
<div @on="touchmove.passive=handleMove"></div>
```

Use `nonpassive` when the handler needs to call `preventDefault()` for an event where passive behavior would prevent that.

---

## Common Examples

### Click

```html
<button @on="click=increment">
  +
</button>
```

```js
methods: {
  increment(event) {
    this.count++;
  },
},
```

### Form Submission

```html
<form @on="submit.prevent=save">
  <input @bind="name" />
  <button type="submit">Save</button>
</form>
```

```js
methods: {
  save(event) {
    // The event has already had preventDefault() applied.
    // Perform the application-level submission here.
  },
},
```

### Keyboard Event

```html
<input @on="keydown.enter=search" />
```

```js
methods: {
  search(event) {
    console.log("Searching...");
  },
},
```

### Event and Explicit Argument

```html
<button @on="click=select:item.id">
  Select
</button>
```

```js
methods: {
  select(event, id) {
    this.activeId = id;
  },
},
```

### Multiple Arguments

```html
<button @on="click=update:user.id:'active'">
  Activate
</button>
```

```js
methods: {
  update(event, id, status) {
    console.log(id, status);
  },
},
```

---

## Full Component Example

```js
import { createComponent, html, render } from "udodi";

const Counter = createComponent({
  name: "Counter",

  state() {
    return {
      count: 0,
      draft: "",
    };
  },

  methods: {
    increment(event) {
      this.count++;
    },

    reset(event) {
      this.count = 0;
    },

    submit(event) {
      if (!this.draft.trim()) return;

      console.log("Submitted:", this.draft);
      this.draft = "";
    },

    handleKey(event) {
      console.log("Key:", event.key);
    },
  },

  template: () => html`
    <div>
      <p @text="count"></p>

      <button @on="click=increment">
        +
      </button>

      <button @on="click=reset">
        Reset
      </button>

      <input
        @bind="draft"
        @on="keydown.enter=submit"
      />

      <input @on="keydown=handleKey" />

      <button @on="click=submit">
        Send
      </button>
    </div>
  `,
});

render(Counter(), "#app");
```

---

## Multiple Events

Multiple event bindings can share one `@on` attribute:

```html
<button
  @on="click=save keydown.enter=save mouseenter=highlight"
>
  Save
</button>
```

Each event has its own listener and handler invocation.

```js
methods: {
  save(event) {
    // event is the event that triggered this invocation.
  },

  highlight(event) {
    // event is the mouseenter event.
  },
},
```

---

## Event Handling Flow

When Udodi processes an `@on` directive:

```text
@on="click=save"
        │
        ▼
register click listener
        │
        ▼
DOM event occurs
        │
        ▼
apply modifiers
        │
        ▼
evaluate handler
        │
        ▼
save(event)
```

With explicit arguments:

```text
DOM event
    │
    ▼
save(event, argument1, argument2, ...)
```

The event is therefore part of the handler contract, not a separately resolved template value.

---

## Lifecycle and Cleanup

`@on` listeners belong to the component's runtime scope.

When the component scope is disposed, the runtime removes the registered event listeners.

The `@on` attribute is also removed after the directive has been processed, so it is not retained as an active directive in the mounted DOM.

Conceptually:

```text
template
   │
   ▼
@on directive
   │
   ▼
event listener
   │
   ├── event → handler(event, ...)
   │
   └── component disposal → remove listener
```

---

## `@on` vs `@bind`

| | `@on` | `@bind` |
|--|-------|---------|
| Purpose | Respond to DOM events | Synchronize form control values |
| Direction | Event → handler | Context ↔ DOM |
| Event object | Passed as first handler argument | Used internally by the binding |
| Typical events | `click`, `submit`, `keydown`, `input`, etc. | `input` / `change` |
| Typical use | Application behavior | Form state synchronization |

They can be used together:

```html
<input
  @bind="userName"
  @on="keydown.enter=save"
/>
```

Here:

- `@bind` keeps `userName` synchronized with the input.  
- `@on` invokes `save(event)` when Enter is pressed.  

---

## Constraints

| Rule | Detail |
|------|--------|
| Event argument | The native DOM event is passed as the first handler argument |
| Additional arguments | Supplied after the handler using `:` syntax |
| Handler | Resolves against the component context |
| `prevent` | Calls `event.preventDefault()` |
| `stop` | Calls `event.stopPropagation()` |
| `self` | Requires `event.target` to equal the bound element |
| `once` | Removes the listener after the first successful invocation |
| Key filters | `enter`, `esc`, `space`, and `tab` |
| Listener options | `passive` and `nonpassive` |
| Cleanup | Listeners are removed when the component scope is disposed |
| Runtime attribute | `@on` is removed after the directive is processed |

---

## Syntax Summary

| Syntax | Behavior |
|--------|----------|
| `@on="click=save"` | Calls `save(event)` on click |
| `@on="click=save:id"` | Calls `save(event, id)` |
| `@on="submit.prevent=save"` | Prevents default, then calls `save(event)` |
| `@on="keydown.enter=submit"` | Calls `submit(event)` only for Enter |
| `@on="click.self=close"` | Calls `close(event)` only when the element itself is the event target |
| `@on="click.once=init"` | Calls `init(event)` once |
| `@on="click=save keydown.enter=save"` | Registers two independent event bindings |

---

## Next Steps

* [Template DSL](./dsl.md) — expression, call, and argument syntax  
* [`@bind`](./bind.md) — two-way form control synchronization  
* [`@text`](./text.md) — reactive text content  
* [`@ref`](./ref.md) — access DOM elements through component refs  
* [Methods](../fundamentals/methods.md) — define component event handlers  
* [Template Overview](./overview.md) — understand the template system  
