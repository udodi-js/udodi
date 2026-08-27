# Overlay

Udodi includes a built-in **Overlay system** for managing modals, dialogs, confirmations, and other layered UI experiences.

The Overlay system is part of the core runtime. It provides the interaction and lifecycle behavior needed by modal interfaces while leaving the visual design to your application.

An overlay is opened with **`openModal()`**. Its content receives a **`close()`** helper, and `openModal()` returns a **Promise** that resolves when that overlay closes.

The runtime handles:

* Backdrop rendering and backdrop-to-close behavior
* Escape-to-close behavior
* Document scroll locking
* Initial focus
* Focus trapping
* Focus restoration
* Overlay stacking
* Per-overlay `zIndex`
* Optional host `className`
* A shared overlay root

The system is intentionally small: Udodi manages the mechanics of an overlay, while your application controls the appearance and content.

---

## Guides

| Guide | Description |
| --- | --- |
| **[Overlay Overview](./overview.md)** | Understand the Overlay model, shared root, host structure, and lifecycle. |
| **[Opening Overlays](./opening.md)** | Open overlays with `openModal()`, render their content, and work with the returned Promise. |
| **[Closing Overlays](./closing.md)** | Close overlays with `close()`, and `closeTopModal()`, and return results to the caller. |
| **[Overlay Options](./options.md)** | Configure backdrop behavior, Escape handling, scroll locking, focus trapping, `zIndex`, and host classes. |
| **[Overlay Stacking](./stacking.md)** | Work with multiple open overlays and understand top-most overlay behavior. |
| **[Accessibility](./accessibility.md)** | Understand dialog semantics, focus management, keyboard navigation, and focus restoration. |

**Start here → [Overlay Overview](./overview.md)**

---

## Quick Example

A common use case is a confirmation dialog that returns a value to the code that opened it.

Modal content is typically a component. Pass the `close` helper as a callback prop so the dialog can resolve the overlay with a result:

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
    // Perform deletion
  }
}
```

The important part is the relationship between `openModal()` and `close()`:

1. `openModal()` receives a render function.
2. The render function receives a `close(result)` helper.
3. Calling `close(result)` closes that overlay.
4. The Promise returned by `openModal()` resolves with `result`.
5. Backdrop and Escape closing resolve with `false` by default.
6. The runtime manages focus, scrolling, and stacking while the overlay is open.

This makes an overlay behave like an asynchronous UI operation:

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

---

## Core Concepts

### Opening an Overlay

Use `openModal()` to create an overlay:

```js
const result = await openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
  });
});
```

The render function receives a `close(result)` function that is bound to that specific overlay.

You can therefore return a value directly from the UI. For example, a dialog component can call the callback prop with a string result:

```js
const ApproveDialog = createComponent({
  name: "ApproveDialog",

  methods: {
    approve() {
      this.onConfirm?.("approved");
    },
  },

  template: () => html`
    <button type="button" @on="click=approve">
      Approve
    </button>
  `,
});

const result = await openModal((close) => {
  return ApproveDialog({
    onConfirm: close,
  });
});

console.log(result);
// "approved"
```

See **[Opening Overlays](./opening.md)** for the complete opening API.

### Closing an Overlay

An overlay can be closed from inside its content or through the public closing functions:

| API | Behavior |
| --- | --- |
| **`close(result)`** | Closes the overlay associated with the current render function and resolves its Promise. |
| **`closeTopModal(result)`** | Closes the top-most open overlay. |

When no result is supplied, the result defaults to `false`.

Backdrop and Escape closing also use `false` as their result.

```js
const result = await openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
  });
});

if (result === true) {
  // Confirmed
}
```

See **[Closing Overlays](./closing.md)**.

### Overlay Options

`openModal()` accepts an optional configuration object:

| Option | Default | Purpose |
| --- | --- | --- |
| `renderBackdrop` | `true` | Render the overlay backdrop. |
| `closeOnBackdrop` | `true` | Close when the rendered backdrop is clicked. |
| `closeOnEscape` | `true` | Close the top-most overlay when Escape is pressed. |
| `lockScroll` | `true` | Lock document scrolling while the overlay is open. |
| `focusTrap` | `true` | Keep Tab and Shift+Tab navigation within the top-most overlay. |
| `zIndex` | `undefined` | Set an inline z-index on the overlay host. |
| `className` | `undefined` | Add class name(s) to the overlay host. |

For example:

```js
await openModal(
  (close) => ConfirmDialog({ onConfirm: close }),
  {
    closeOnEscape: false,
    focusTrap: true,
    zIndex: 10000,
    className: "my-modal",
  },
);
```

See **[Overlay Options](./options.md)** for details.

### Overlay Stacking

Overlays are maintained as a stack.

Multiple overlays can therefore be open simultaneously:

```text
Overlay A
    │
    ▼
Overlay B
    │
    ▼
Overlay C  ← top-most
```

The top-most overlay has exclusive control over behaviors that must apply to only one overlay at a time:

* Escape closes the top-most overlay.
* Focus trapping applies to the top-most overlay.
* `closeTopModal()` closes the top-most overlay.

Closing an overlay removes it from the stack. An underlying overlay becomes active again.

Scroll locking is reference-counted. If several overlays have `lockScroll: true`, closing one does not unlock the document while another locking overlay remains open.

See **[Overlay Stacking](./stacking.md)**.

### Focus Management

The runtime provides basic focus management for dialog-style overlays.

When an overlay opens:

1. The dialog layer receives focus.
2. If `focusTrap` is enabled, Tab and Shift+Tab navigation are kept within the active overlay.
3. Only the top-most overlay traps focus.
4. When the overlay closes, focus is restored to the element that was active before it opened.

The generated dialog layer uses:

```html
<div
  udodi-overlay-layer
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
```

This provides the structural semantics and focus target needed by the runtime. Your application remains responsible for providing appropriate dialog content, labels, and other accessibility information.

See **[Accessibility](./accessibility.md)**.

### Overlay Host

All overlays are mounted beneath a shared root:

```html
<div id="udodi-overlay-root">
  <!-- active overlays -->
</div>
```

The root is created when the first overlay is opened.

Each overlay uses the following structure:

```html
<div udodi-overlay-host>
  <div udodi-overlay-backdrop></div>

  <div
    udodi-overlay-layer
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div udodi-overlay-panel>
      <!-- your content -->
    </div>
  </div>
</div>
```

When `renderBackdrop` is `false`, the backdrop element is omitted.

The runtime injects minimal structural CSS for:

* Full-viewport positioning
* Backdrop coverage
* Dialog-layer centering
* Panel interaction

It does not impose a visual design on the dialog panel. Your application controls its typography, colors, dimensions, borders, shadows, animations, and other presentation details.

The default overlay host has a z-index of `9999`. The `zIndex` option can override this value on an individual overlay when required by the application's stacking contexts.

---

## Lifecycle

An overlay follows a simple lifecycle:

```text
openModal()
    │
    ├── create shared overlay root
    ├── lock scrolling (if enabled)
    ├── remember active element
    ├── add overlay to stack
    │
    ▼
mount overlay content
    │
    ├── render backdrop (if enabled)
    ├── focus dialog layer
    ├── install focus trap (if enabled)
    │
    ▼
user interaction
    │
    ├── close()
    ├── backdrop
    ├── Escape
    │
    ▼
closeModal()
    │
    ├── unmount overlay
    ├── remove from stack
    ├── release scroll lock
    ├── restore previous focus
    └── resolve Promise
```

Closing is idempotent: once an overlay has closed, subsequent attempts to close the same overlay have no effect.

---

## Design Philosophy

The Overlay system provides the behavioral foundation, not a complete visual component library.

Udodi handles concerns that are easy to get subtly wrong when implemented repeatedly:

* Which overlay owns Escape?
* Which overlay should trap focus?
* When can the document scroll again?
* Where should focus return after closing?
* How should nested overlays interact?
* How should an overlay escape an application's existing stacking context?

Your application still decides what the overlay looks like and what its content means.

This separation keeps the runtime predictable while allowing overlays to match the application's design system.

---

## Related Documentation

* **[Overlay Overview](./overview.md)** — Overlay architecture and lifecycle.
* **[Opening Overlays](./opening.md)** — Opening and rendering overlays.
* **[Closing Overlays](./closing.md)** — Closing overlays and returning results.
* **[Overlay Options](./options.md)** — Overlay configuration.
* **[Overlay Stacking](./stacking.md)** — Nested and multiple overlays.
* **[Accessibility](./accessibility.md)** — Focus and keyboard behavior.
* **[Overlay API Reference](../api/overlay.md)** — Complete public API reference.
