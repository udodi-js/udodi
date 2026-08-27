# Opening Overlays

An overlay is opened with **`openModal()`**.

`openModal()` mounts the returned content inside the shared overlay root, applies the configured overlay behavior, and returns a **Promise** that resolves when that overlay closes.

This guide covers:

* The `openModal()` signature
* The render function
* The `close(result)` helper
* Returning component content
* Returning HTML content
* Working with the returned Promise
* Passing overlay options
* Opening overlays from component methods
* Opening nested overlays

For closing behavior, configuration, stacking, and accessibility, see the specialized guides linked at the end.

---

## Basic Opening

The simplest way to open an overlay is to provide a render function:

```js
import { openModal } from "udodi";

const result = await openModal((close) => {
  return content;
});
```

The render function is called when the overlay opens and receives a `close(result)` helper associated with that specific overlay.

When `openModal()` runs, the runtime:

1. Ensures that the shared overlay root exists.
2. Injects the minimal structural CSS when necessary.
3. Locks document scrolling when `lockScroll` is enabled.
4. Remembers the currently focused element.
5. Adds the overlay to the stack.
6. Creates the overlay host, backdrop, dialog layer, and panel.
7. Mounts the content returned by the render function.
8. Moves focus to the dialog layer.
9. Installs the focus trap when `focusTrap` is enabled.
10. Returns the Promise associated with the overlay.

The render function itself is called once when the overlay opens.

---

## Signature

```js
openModal(render, options?)
```

| Parameter | Type                                    | Description                                                    |
| --------- | --------------------------------------- | -------------------------------------------------------------- |
| `render`  | `(close: (result?) => void) => content` | Function that returns the content to mount inside the overlay. |
| `options` | `object`                                | Optional overlay configuration.                                |

**Returns:** `Promise<any>`

The Promise resolves with the value supplied when the overlay closes. Backdrop and Escape closing resolve with `false` by default.

---

## The Render Function

The render function is the bridge between the code opening the overlay and the content mounted inside it:

```js
openModal((close) => {
  return content;
});
```

Its `close` argument belongs to that particular overlay.

This is important when several overlays are open at the same time: each render function receives a `close` function associated with its own overlay.

### The `close` Helper

The helper has the following shape:

```js
close(result?)
```

| Argument | Default | Description                                                  |
| -------- | ------- | ------------------------------------------------------------ |
| `result` | `false` | Value used to resolve the Promise returned by `openModal()`. |

Calling `close(result)`:

1. Closes the overlay.
2. Unmounts its content.
3. Removes the overlay from the stack.
4. Restores focus.
5. Resolves the Promise with `result`.

For example, an overlay can resolve with a boolean:

```js
openModal((close) => {
  // Pass close into the overlay content.
});
```

The content can eventually call:

```js
close(true);
```

and the caller receives:

```js
const result = await openModal(...);

// result === true
```

The result does not have to be a boolean. It can be any application value appropriate for the operation.

---

## Returning a Component

For interactive overlays, the recommended approach is to return a **component placeholder**.

The component owns the dialog's methods, state, props, and template, while the render function supplies the overlay's `close` callback.

```js
import { createComponent, html, openModal } from "udodi";

const ConfirmDialog = createComponent({
  name: "ConfirmDialog",

  methods: {
    cancel() {
      this.onConfirm?.(false);
    },

    confirm() {
      this.onConfirm?.(true);
    },
  },

  template: () => html`
    <div class="dialog">
      <h2>Delete item?</h2>
      <p>This action cannot be undone.</p>

      <button type="button" @on="click=cancel">
        Cancel
      </button>

      <button type="button" @on="click=confirm">
        Delete
      </button>
    </div>
  `,
});

async function confirmDelete() {
  const confirmed = await openModal((close) => {
    return ConfirmDialog({
      onConfirm: close,
    });
  });

  if (confirmed) {
    // Perform deletion.
  }
}
```

The important part is how `close` crosses into the component:

```js
return ConfirmDialog({
  onConfirm: close,
});
```

The dialog receives `close` as the `onConfirm` callback. Its methods then invoke that callback with the desired result:

```js
cancel() {
  this.onConfirm?.(false);
},

confirm() {
  this.onConfirm?.(true);
},
```

The template invokes those component methods through the normal Udodi template DSL:

```html
<button @on="click=cancel">
```

and:

```html
<button @on="click=confirm">
```

The template does **not** need to know about the overlay's `close()` function.

This is the preferred pattern for interactive overlays because the component remains responsible for its own behavior while the caller remains responsible for the overlay's asynchronous result.

---

## Why Use a Component?

A component is preferable when the overlay contains interaction or application logic.

It gives the overlay content access to the normal Udodi component model:

* Methods
* State
* Computed values
* Watchers
* Props
* Lifecycle behavior
* Template directives

The overlay itself only needs to provide the callback that ultimately closes it.

Conceptually:

```text
Caller
  │
  │ openModal()
  ▼
Overlay render function
  │
  │ close
  ▼
Dialog component
  │
  │ onConfirm(result)
  ▼
close(result)
  │
  ▼
Promise resolves
```

This keeps overlay management separate from dialog implementation.

---

## Passing Additional Props

The callback used to close the overlay is just a normal component prop. Other props can be passed alongside it:

```js
await openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
    title: "Delete project?",
    message: "This permanently removes the project.",
  });
});
```

The component can consume those props like any other component input.

This makes the same dialog component reusable for different operations:

```js
await openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
    title: "Delete account?",
    message: "This permanently deletes your account.",
  });
});
```

The overlay mechanism does not need to change; only the component's inputs change.

See [Props](../fundamentals/props.md) for the component prop model.

---

## Returning HTML

For simple, primarily static content, the render function can return an HTML string:

```js
await openModal(() => {
  return `
    <div class="dialog">
      <h2>Notice</h2>
      <p>Your session will expire soon.</p>
    </div>
  `;
});
```

The returned content is placed inside the overlay panel. For interactive content that needs to close the overlay or manage application state, prefer a component.

### Do Not Put Arbitrary JavaScript in Directive Values

The overlay render function is JavaScript, but the returned HTML still follows Udodi's template DSL.

This is **not valid Udodi syntax**:

```html
<button @on="click=() => close(false)">
  Cancel
</button>
```

Udodi's template DSL does not accept arbitrary JavaScript arrow functions or JavaScript call syntax in `@on` values.

Instead, use a component method:

```html
<button @on="click=cancel">
  Cancel
</button>
```

and let that method invoke the callback supplied to the component.

See [Template DSL](../templates/dsl.md) for the expression rules used by Udodi templates.

---

## The Returned Promise

`openModal()` returns a Promise representing the lifetime of the overlay:

```js
const result = await openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
  });
});
```

The Promise remains pending while the overlay is open and resolves when the overlay closes.

The resolved value depends on how the overlay closes:

| Close path                  | Resolved value                             |
| --------------------------- | ------------------------------------------ |
| `close(result)`             | The value passed to `close()`.             |
| Backdrop click              | `false`, when backdrop closing is enabled. |
| Escape                      | `false`, when Escape closing is enabled.   |
| `closeTopModal(result)`     | The value passed to `closeTopModal()`.     |

When a close API is called without a result, the result is `false`.

This makes `openModal()` useful for request/response-style UI:

```text
openModal()
     │
     ▼
render content
     │
     ▼
user interaction
     │
     ▼
close(result)
     │
     ▼
Promise resolves
```

### Using `await`

`await` is usually the clearest way to consume an overlay result:

```js
const confirmed = await openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
  });
});

if (confirmed) {
  // Continue after confirmation.
}
```

The surrounding function must be `async` when using `await`.

### Using `.then()`

The Promise can also be consumed directly:

```js
openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
  });
  
}).then((confirmed) => {
  if (confirmed) {
    // Continue after confirmation.
  }
});
```

Both forms observe the same Promise contract.

---

## Passing Options

The second argument to `openModal()` configures the behavior of that particular overlay:

```js
await openModal(
  (close) => ConfirmDialog({
    onConfirm: close,
  }),
  {
    closeOnBackdrop: false,
    closeOnEscape: true,
    lockScroll: true,
    focusTrap: true,
    zIndex: 10000,
    className: "confirm-overlay",
  },
);
```

Available options include:

| Option            | Default     | Purpose                                         |
| ----------------- | ----------- | ----------------------------------------------- |
| `renderBackdrop`  | `true`      | Render the backdrop.                            |
| `closeOnBackdrop` | `true`      | Close when the backdrop is clicked.             |
| `closeOnEscape`   | `true`      | Close the top-most overlay on Escape.           |
| `lockScroll`      | `true`      | Lock document scrolling while open.             |
| `focusTrap`       | `true`      | Trap Tab and Shift+Tab within the dialog layer. |
| `zIndex`          | `undefined` | Set the host's inline `z-index`.                |
| `className`       | `undefined` | Add class name(s) to the overlay host.          |

These settings apply to the overlay created by that particular `openModal()` call.

See [Overlay Options](./options.md) for the complete behavior of each option.

---

## Opening from a Component Method

Overlays are commonly opened in response to component interaction.

For example, a component can open a confirmation dialog from one of its methods:

```js
import {
  createComponent,
  html,
  openModal,
  render,
} from "udodi";

const ConfirmDialog = createComponent({
  name: "ConfirmDialog",

  methods: {
    cancel() {
      this.onConfirm?.(false);
    },

    confirm() {
      this.onConfirm?.(true);
    },
  },

  template: () => html`
    <div class="dialog">
      <h2>Delete item?</h2>
      <p>This action cannot be undone.</p>

      <button type="button" @on="click=cancel">
        Cancel
      </button>

      <button type="button" @on="click=confirm">
        Delete
      </button>
    </div>
  `,
});

const ItemList = createComponent({
  name: "ItemList",

  methods: {
    async removeItem(event) {
      const confirmed = await openModal((close) => {
        return ConfirmDialog({
          onConfirm: close,
        });
      });

      if (!confirmed) return;

      // Delete the item...
    },
  },

  template: () => html`
    <button type="button" @on="click=removeItem">
      Delete
    </button>
  `,
});

render(ItemList(), "#app");
```

The component method waits for the overlay:

```js
const confirmed = await openModal(...);
```

and execution continues after the Promise resolves.

This makes confirmation flows straightforward:

```text
click Delete
     │
     ▼
removeItem()
     │
     ▼
openModal()
     │
     ▼
confirmation dialog
     │
     ├── Cancel ──► false
     │
     └── Delete ──► true
                     │
                     ▼
              continue deletion
```

---

## Nested Opening

An overlay can open another overlay.

Each call to `openModal()` creates another stack entry:

```js
await openModal((close) => {
  return FirstDialog({
    onConfirm: close,

    onOpenNested: async () => {
      const nestedResult = await openModal((nestedClose) => {
        return NestedDialog({
          onConfirm: nestedClose,
        });
      });

      // Use nestedResult...
    },
  });
});
```

The nested overlay receives its own `nestedClose` function.

The two callbacks therefore belong to different overlays:

```text
First overlay
    │
    └── close()
          │
          ▼
       First overlay


Nested overlay
    │
    └── nestedClose()
          │
          ▼
       Nested overlay
```

While both are open, the nested overlay is the top-most overlay. Consequently, top-modal behavior such as Escape handling, focus trapping, and `closeTopModal()` applies to the nested overlay.

See [Overlay Stacking](./stacking.md).

---

## What Happens When an Overlay Opens

The opening sequence can be summarized as:

```text
openModal(render, options)
        │
        ├── inject structural CSS (once)
        │
        ├── ensure #udodi-overlay-root
        │
        ├── lock scroll (if enabled)
        │
        ├── remember document.activeElement
        │
        ├── push overlay onto stack
        │
        ▼
   build host structure
        │
        ├── optional backdrop
        │
        ├── dialog layer
        │
        └── panel containing render content
        │
        ▼
      mount overlay
        │
        ├── apply zIndex / className
        ├── register backdrop handling
        ├── focus dialog layer
        └── install focus trap (if enabled)
```

The overlay then remains open until one of its supported close paths is used.

---

## Common Mistakes

| Mistake                                                             | Result                                                                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Using `@on="click=() => close(false)"`                              | Invalid Udodi template DSL. Use a component method and callback prop instead.                                                       |
| Forgetting to pass `close` into interactive content                 | The content has no intentional way to resolve the overlay's Promise.                                                                |
| Expecting `openModal()` to return a modal handle                    | It returns a Promise. The render callback receives the `close` helper for that overlay.                                             |
| Embedding complex interaction logic in an HTML string               | Prefer a component with methods, state, and props.                                                                                  |
| Assuming every close path returns a custom value                    | Backdrop and Escape resolve with `false` by default.                                                                                |
| Treating the render callback's `close` variable as template context | JavaScript variables in the render callback are not automatically available to the component template. Pass the callback as a prop. |

The most important rule is to keep the two layers separate:

```text
JavaScript
    │
    ├── openModal()
    ├── render callback
    └── close(result)
          │
          ▼
      Component
          │
          ├── props
          ├── methods
          └── Udodi template DSL
```

The render function connects the overlay lifecycle to the component; it does not change the rules of the template DSL.

---

## Next Steps

| Goal                                                         | Guide                                   |
| ------------------------------------------------------------ | --------------------------------------- |
| Close overlays and return results                            | **[Closing Overlays](./closing.md)**    |
| Configure backdrop, Escape, scroll, focus, and host behavior | **[Overlay Options](./options.md)**     |
| Open and manage multiple overlays                            | **[Overlay Stacking](./stacking.md)**   |
| Understand focus and dialog semantics                        | **[Accessibility](./accessibility.md)** |
| Understand the complete Overlay model                        | **[Overlay Overview](./overview.md)**   |

For precise public API signatures, see the **[Overlay API Reference](../api/overlay.md)**.
