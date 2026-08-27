# Overlay Overview

Udodi's **Overlay system** provides the runtime infrastructure for modals, dialogs, confirmations, and other layered UI.

The system is built into the core runtime. It provides:

* `openModal()`
* `closeTopModal()`

`openModal()` returns a **Promise** that resolves when the overlay closes. The render function receives a `close(result)` helper, allowing the overlay's content to return a value to the code that opened it.

The runtime also manages the interaction mechanics that commonly accompany modal interfaces:

* Overlay root creation
* Backdrop rendering
* Backdrop-to-close behavior
* Escape-to-close behavior
* Document scroll locking
* Focus management
* Focus trapping
* Focus restoration
* Overlay stacking
* Per-overlay `zIndex`
* Optional host classes

Udodi deliberately keeps visual design separate from runtime behavior. The runtime injects only the structural CSS required to position and operate the overlay; application styles control the appearance of the dialog.

---

## How the Pieces Fit Together

| API                           | Role                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `openModal(render, options?)` | Opens an overlay, mounts it under the shared overlay root, and returns a Promise for its closing result. |
| `close(result?)`              | Helper passed to the `render` function. Closes that specific overlay and resolves its Promise.           |
| `closeTopModal(result?)`      | Closes the top-most overlay currently on the stack.                                                      |

The runtime lifecycle is approximately:

```text
           openModal(render, options)
                       │
                       ▼
              inject structural CSS
                       │
                       ▼
           ensure #udodi-overlay-root
                       │
                       ▼
            lock scroll (if enabled)
                       │
                       ▼
       remember previously focused element
                       │
                       ▼
            push overlay onto stack
                       │
                       ▼
      render host + backdrop + layer + panel
                       │
                       ▼
                 mount overlay
                       │
                       ▼
                  focus layer
                       │
                       ▼
          install focus trap (if enabled)
                       │
                       ▼
        ┌──────────────────────────────┐
        │          open state          │
        │                              │
        │ close(result)                │
        │ backdrop                     │
        │ Escape                       │
        │ closeTopModal()              │
        └──────────────┬───────────────┘
                       │
                       ▼
                 close overlay
                       │
                       ▼
              unmount + remove stack
                       │
                       ▼
                 unlock scroll
                       │
                       ▼
                 restore focus
                       │
                       ▼
                resolve Promise
```

The important distinction is that the **overlay lifecycle** is owned by the runtime, while the **dialog content** is owned by the application.

---

## Opening an Overlay

`openModal()` accepts a render function and an optional options object:

```js
const result = await openModal((close) => {
  // Return the overlay content.
}, {
  // optional configuration
});
```

The render function is called with a `close(result)` helper belonging to that particular overlay.

This makes it possible to pass `close` into a component as a callback prop:

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

const confirmed = await openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
  });
});
```

The important part of this pattern is the boundary between JavaScript and the template DSL.

The JavaScript render function receives `close`:

```js
openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
  });
});
```

The component receives that function as a prop:

```js
onConfirm: close
```

The component method then calls the callback:

```js
this.onConfirm?.(true);
```

Inside the template, the event handler uses Udodi's normal `@on` syntax:

```html
<button @on="click=confirm">
```

The template does **not** use JavaScript arrow functions or arbitrary JavaScript expressions. Udodi's template DSL resolves `confirm` as the component method.

When the callback eventually invokes `close(true)`, the Promise returned by `openModal()` resolves with `true`.

```js
if (confirmed) {
  // Perform deletion.
}
```

This gives overlays a natural asynchronous API:

```text
openModal()
     │
     ▼
render component
     │
     ▼
user interaction
     │
     ▼
close(result)
     │
     ▼
Promise resolves with result
```

See [Opening Overlays](./opening.md) for more content patterns and details about the Promise contract.

---

## Closing Overlays

An overlay can be closed through several mechanisms.

| Mechanism                    | Behavior                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `close(result)`              | Closes the overlay associated with the current render function and resolves its Promise.       |
| `closeTopModal(result?)`     | Closes the top-most overlay.                                                                   |
| Backdrop click               | Closes the overlay with `false` when both backdrop rendering and backdrop closing are enabled. |
| Escape                       | Closes the top-most overlay with `false` when `closeOnEscape` is enabled.                      |

The `close()` helper defaults its result to `false`:

```js
const result = await openModal((close) => {
  // close() resolves the Promise with false.
});
```

An application can return any value:

```js
const result = await openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
  });
});

// result may be true, false, an object, a string, etc.
```

When an overlay closes, the runtime:

1. Marks the overlay as closed.
2. Unmounts its instance.
3. Removes it from the modal stack.
4. Releases its scroll-lock ownership when applicable.
5. Restores focus to the element that was active before opening.
6. Resolves the `openModal()` Promise with the supplied result.

Closing is guarded against repeated execution: once an overlay has been marked closed, subsequent attempts to close the same entry have no effect.

See [Closing Overlays](./closing.md).

---

## Overlay Options

`openModal()` accepts an optional configuration object:

| Option            | Default     | Purpose                                                      |
| ----------------- | ----------- | ------------------------------------------------------------ |
| `renderBackdrop`  | `true`      | Whether to render the backdrop element.                      |
| `closeOnBackdrop` | `true`      | Whether a click on the backdrop closes the overlay.          |
| `closeOnEscape`   | `true`      | Whether Escape closes the top-most overlay.                  |
| `lockScroll`      | `true`      | Whether the overlay participates in document scroll locking. |
| `focusTrap`       | `true`      | Whether the top-most overlay traps Tab and Shift+Tab focus.  |
| `zIndex`          | `undefined` | Inline `z-index` applied to the overlay host.                |
| `className`       | `undefined` | Additional class name(s) applied to the overlay host.        |

For example:

```js
await openModal(
  (close) => ConfirmDialog({
    onConfirm: close,
  }),
  {
    closeOnBackdrop: false,
    lockScroll: true,
    zIndex: 10000,
    className: "confirm-overlay",
  },
);
```

The default host `z-index` is `9999`. Providing `zIndex` overrides that value on the individual host.

See [Overlay Options](./options.md).

---

## The Shared Overlay Root

All overlays are mounted under a shared root:

```html
<div id="udodi-overlay-root">
  <!-- active overlays -->
</div>
```

The root is created on demand and appended directly to `document.body`.

This gives overlays a predictable location outside the normal application component hierarchy and makes the overlay layer independent of the application's ordinary layout structure.

The runtime also injects its structural overlay stylesheet when `openModal()` is first used. The stylesheet is injected only once.

---

## Host Structure

Each open overlay creates its own host beneath the shared root.

With a backdrop enabled, the structure is:

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
      <!-- render() content -->
    </div>
  </div>
</div>
```

When `renderBackdrop` is `false`, the backdrop element is omitted.

The structural elements have distinct responsibilities:

| Element                    | Role                                                                             |
| -------------------------- | -------------------------------------------------------------------------------- |
| `#udodi-overlay-root`      | Shared container appended to `document.body`.                                    |
| `[udodi-overlay-host]`     | Fixed, full-viewport overlay host.                                               |
| `[udodi-overlay-backdrop]` | Full-viewport backdrop that can receive close clicks.                            |
| `[udodi-overlay-layer]`    | Full-viewport dialog layer that centers the panel and provides the focus target. |
| `[udodi-overlay-panel]`    | Wrapper around application content; pointer events are enabled here.             |

The runtime applies the following structural behavior:

* The host is fixed to the viewport.
* The backdrop covers the viewport.
* The layer centers the panel.
* The layer itself has `pointer-events: none`.
* The panel has `pointer-events: auto`.

This allows the backdrop and centered panel to coexist without requiring application-specific positioning CSS.

The runtime also provides a default backdrop color:

```css
background: rgba(0, 0, 0, 0.5);
```

Application styles remain responsible for the dialog's visual design.

---

## Stacking

Overlays are maintained in a stack:

```text
     Bottom
       │
       ▼
┌─────────────┐
│   Modal A   │
├─────────────┤
│   Modal B   │
├─────────────┤
│   Modal C   │ ◄─── top-most
└─────────────┘
```

Multiple overlays can therefore remain open simultaneously.

The **top-most overlay** owns behaviors that must apply to only one overlay at a time:

* Escape handling
* Focus trapping
* `closeTopModal()`

For example:

```js
const first = openModal(renderFirst);

const second = openModal(renderSecond);

// Closes second, because it is currently top-most.
closeTopModal();
```

The underlying overlay remains in the stack and becomes the active top-most overlay after the upper overlay closes.

Scroll locking is independent of the stack itself. Each overlay that opens with `lockScroll: true` increments a shared lock count. The document remains locked until all locking overlays have closed.

See [Overlay Stacking](./stacking.md).

---

## Accessibility

The runtime provides several pieces of dialog-oriented accessibility behavior.

| Behavior          | Runtime behavior                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Dialog semantics  | The overlay layer uses `role="dialog"` and `aria-modal="true"`.                               |
| Initial focus     | Focus moves to the overlay layer after mounting.                                              |
| Focus target      | The layer uses `tabindex="-1"` so it can receive programmatic focus.                          |
| Focus trap        | Tab and Shift+Tab are cycled through focusable elements in the top-most overlay when enabled. |
| Focus restoration | Focus returns to the element that was active before the overlay opened.                       |
| Escape            | The top-most overlay can close from Escape when enabled.                                      |

The focus trap recognizes:

* Links with `href`
* Enabled buttons
* Enabled inputs except hidden inputs
* Enabled selects
* Enabled textareas
* Elements with a `tabindex` other than `-1`

Elements inside `[hidden]` or `[aria-hidden="true"]` containers, as well as elements that are not visibly rendered, are excluded.

When the active overlay contains no focusable elements, the focus trap keeps focus on the dialog layer itself.

The runtime provides the structural accessibility behavior, but the application is still responsible for making the dialog content meaningful and usable; for example, providing an appropriate heading or accessible name where required.

See [Accessibility](./accessibility.md).

---

## What the Runtime Owns vs What You Own

The Overlay system deliberately separates runtime mechanics from application content and presentation.

| Runtime owns                     | Application owns                        |
| -------------------------------- | --------------------------------------- |
| Shared overlay root              | Dialog content                          |
| Overlay host structure           | Dialog markup                           |
| Backdrop element                 | Dialog styling                          |
| Dialog layer and panel wrapper   | Colors, borders, shadows, typography    |
| Backdrop closing                 | When to open the overlay                |
| Escape handling                  | What each result means                  |
| Scroll locking                   | Application-specific focusable controls |
| Focus trapping                   | Dialog labels and content semantics     |
| Focus restoration                | Animations and transitions              |
| Stack management                 | Nested overlay application logic        |
| Structural CSS                   | Visual design and theming               |
| Per-overlay `zIndex` application | Choosing appropriate `zIndex` values    |

This separation allows the runtime to provide consistent overlay behavior without forcing an application into a particular visual design.

---

## Runtime CSS

The Overlay system injects a small stylesheet when overlays are first used.

Its purpose is structural rather than cosmetic:

```css
[udodi-overlay-host] {
  position: fixed;
  inset: 0;
  z-index: 9999;
}

[udodi-overlay-backdrop] {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}

[udodi-overlay-layer] {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  pointer-events: none;
}

[udodi-overlay-panel] {
  position: relative;
  pointer-events: auto;
}
```

This CSS establishes the overlay's viewport positioning, backdrop coverage, centered layout, and pointer-event boundaries.

It does not attempt to provide a complete modal design system. Applications can target the structural attributes directly or use the `className` option to attach application-specific styles.

---

## A Useful Mental Model

An Overlay can be thought of as three cooperating layers:

```text
Application (dialog component / content)
                  │
                  │
                  ▼
    ┌───────────────────────────────┐
    │       Overlay Panel           │
    │                               │
    │       application UI          │
    └───────────────────────────────┘
                  ▲
                  │
    ┌───────────────────────────────┐
    │       Overlay Layer           │
    │                               │
    │  focus + centering + keyboard │
    └───────────────────────────────┘
                  ▲
                  │
    ┌───────────────────────────────┐
    │       Overlay Host            │
    │                               │
    │       backdrop + viewport     │
    └───────────────────────────────┘
                  ▲
                  │
          #udodi-overlay-root
```

The application primarily owns the content inside the panel.

The runtime owns the layers surrounding that content and coordinates them with the global overlay stack.

---

## Related Guides

| Guide                                   | Description                                                            |
| --------------------------------------- | ---------------------------------------------------------------------- |
| **[Opening Overlays](./opening.md)**    | Render functions, content patterns, and the Promise contract.          |
| **[Closing Overlays](./closing.md)**    | `close()`, `closeTopModal()`, and close results.                       |
| **[Overlay Options](./options.md)**     | Backdrop, Escape, scroll lock, focus trap, `zIndex`, and host classes. |
| **[Overlay Stacking](./stacking.md)**   | Multiple overlays, top-most behavior, and nested overlays.             |
| **[Accessibility](./accessibility.md)** | Dialog semantics, focus management, and keyboard behavior.             |

For precise public API signatures, see the **[Overlay API Reference](../api/overlay.md)**.
