# Accessibility

Udodi's Overlay system provides structural accessibility support for dialog-style layered UI. The runtime manages the mechanics required to move and contain keyboard focus across overlays while leaving application-specific semantics and visual presentation to your components.

By default, an overlay provides:

* Dialog semantics
* Initial focus
* Focus trapping
* Focusable-element discovery
* Focus restoration
* Escape-key dismissal

These behaviors also compose across nested overlays. The top-most overlay owns active keyboard behavior while underlying overlays remain available to resume when the top layer closes.

The runtime does **not** determine what your dialog means or how it should be presented. Your application remains responsible for:

* An accessible name and description
* Meaningful dialog content
* Clearly labeled actions
* An explicit dismiss path
* Visible focus indicators
* Sufficient color contrast
* Any additional ARIA required by the specific interface

For configuration, see [Overlay Options](./options.md). For top-most behavior and nested overlays, see [Overlay Stacking](./stacking.md).

---

## Dialog Semantics

Each overlay creates a dialog layer with the following structural attributes:

```html
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
```

| Attribute               | Purpose                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **`role="dialog"`**     | Identifies the overlay as a dialog to assistive technologies.                                                       |
| **`aria-modal="true"`** | Communicates that the dialog is modal and that content outside it is not part of the current interaction.           |
| **`tabindex="-1"`**     | Allows the runtime to focus the dialog layer programmatically without adding it to the normal sequential Tab order. |

The runtime supplies these structural semantics automatically.

It does **not** automatically assign an accessible name such as `aria-label` or `aria-labelledby`. The dialog content must therefore provide the labeling information appropriate for the interface.

A dialog will commonly have a visible heading and descriptive text:

```js
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
    <div
      class="dialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-description"
    >
      <h2 id="confirm-title">
        Delete item?
      </h2>

      <p id="confirm-description">
        This action cannot be undone.
      </p>

      <button type="button" @on="click=cancel">
        Cancel
      </button>

      <button type="button" @on="click=confirm">
        Delete
      </button>
    </div>
  `,
});
```

Use the labeling mechanism appropriate to the structure of your dialog and application. A visible heading is generally preferable when the title is part of the UI itself.

---

## Initial Focus

When an overlay opens, the runtime moves focus to its dialog layer after the overlay has mounted.

Conceptually:

```text
mount overlay
     │
     ▼
queueMicrotask
     │
     ▼
layer.focus()
     │
     ▼
install focus trap
```

The layer has `tabindex="-1"`, allowing it to receive programmatic focus without becoming a normal Tab stop.

Initial layer focus provides a reliable starting point for the overlay:

* Keyboard focus moves into the dialog.
* The focus trap has a known container.
* The overlay remains focusable even when it contains no focusable controls.
* Focus does not remain on an unrelated page element behind the modal.

The runtime does not automatically choose a particular input, button, or other control inside the dialog.

### Focusing a Specific Control

Some dialogs benefit from placing focus directly on a particular control—for example, the first form field or the primary action.

A component can move focus after mounting:

```js
const FormDialog = createComponent({
  name: "FormDialog",

  onMount(root) {
    root.querySelector("input")?.focus();
  },

  // ...
});
```

This leaves the runtime's normal layer focus behavior intact while allowing the application to establish a more specific starting point.

Use targeted initial focus when it improves the interaction. The layer itself is a valid focus target and provides a useful default for dialogs without an obvious first control.

---

## Focus Trapping

`focusTrap` is enabled by default.

When enabled, keyboard focus is contained within the **top-most** overlay's dialog layer:

```js
await openModal(render, {
  focusTrap: true,
});
```

The runtime handles both forward and reverse Tab navigation.

| Keyboard action                              | Behavior                                                  |
| -------------------------------------------- | --------------------------------------------------------- |
| **Tab** at the last focusable element        | Focus moves to the first focusable element                |
| **Shift+Tab** at the first focusable element | Focus moves to the last focusable element                 |
| **Tab** with no focusable children           | Focus remains on the dialog layer                         |
| Focus moves outside the active layer         | The trap brings focus back into the overlay's focus cycle |

Conceptually:

```text
┌───────────────────────────────┐
│             Dialog            │
│                               │
│        [First control]        │
│           ▲       │           │
│           │       ▼           │
│         [Last control]        │
│                               │
└───────────────────────────────┘
```

The focus cycle does not allow normal Tab navigation to continue into the page behind the modal.

### Top-Most Overlay Only

Focus trapping follows the overlay stack.

If two overlays are open:

```text
Overlay A
Overlay B  ← top-most
```

B owns the active focus trap.

A may retain its own trap state, but it does not control keyboard focus while B is top-most.

```text
Overlay A  → trap inactive

Overlay B  → trap active
                ▲
                │
            Tab / Shift+Tab
```

When B closes, A becomes top-most and its focus behavior resumes.

This prevents multiple nested overlays from competing for keyboard focus.

---

## Disabling the Focus Trap

The trap can be disabled per overlay:

```js
await openModal(render, {
  focusTrap: false,
});
```

With the trap disabled, the runtime no longer cycles focus inside the dialog layer.

For a conventional modal dialog, the default:

```js
focusTrap: true
```

should normally be retained.

Disable the trap only when the interaction intentionally requires behavior different from a conventional modal focus model.

See [Overlay Options](./options.md).

---

## Focusable Elements

The focus trap discovers focusable elements inside the dialog layer.

The runtime considers elements matching these categories:

```css
a[href]

button:not([disabled])

input:not([disabled]):not([type='hidden'])

select:not([disabled])

textarea:not([disabled])

[tabindex]:not([tabindex='-1'])
```

This includes native interactive controls and custom elements that explicitly participate in the tab order.

### Elements That Are Skipped

An otherwise focusable element is excluded when it is:

* Inside a `[hidden]` subtree
* Inside an `[aria-hidden="true"]` subtree
* Not visibly rendered
* A disabled control
* Assigned `tabindex="-1"`

The layer itself remains available as the fallback focus target.

| Included                                         | Excluded                         |
| ------------------------------------------------ | -------------------------------- |
| Visible links                                    | Disabled controls                |
| Enabled buttons                                  | Hidden controls                  |
| Enabled form controls                            | `input[type="hidden"]`           |
| Visible elements with a non-`-1` tabindex        | `tabindex="-1"` elements         |
| Visible custom controls with a non-`-1` tabindex | Hidden or `aria-hidden` subtrees |

This means application controls should use genuine focusable elements whenever possible.

Prefer:

```html
<button type="button">
  Delete
</button>
```

over a non-interactive element that only looks like a button.

If a custom control is necessary, ensure that it participates correctly in keyboard interaction and the Tab order.

---

## Focus Restoration

When an overlay opens, the runtime records the element that currently owns focus.

When that overlay closes, the runtime attempts to restore focus to that element.

The lifecycle is:

```text
open
  │
  ▼
remember previous active element
  │
  ▼
focus dialog layer
  │
  ▼
user interacts with overlay
  │
  ▼
close
  │
  ▼
unmount overlay
  │
  ▼
restore previous focus
```

Focus restoration is performed safely. If the original element has since been removed from the document or can no longer be focused, the restoration attempt does not cause the close operation to fail.

### Nested Overlays

Each overlay stores its own previous active element.

This is important when overlays are nested.

Consider:

```text
Page button focused
       │
       ▼
open Parent
       │
       ├── Parent remembers page button
       │
       ▼
focus moves into Parent
       │
       ▼
open Nested
       │
       ├── Nested remembers focused control in Parent
       │
       ▼
focus moves into Nested
```

When Nested closes:

```text
Nested closes
     │
     ▼
focus returns to control in Parent
```

When Parent subsequently closes:

```text
Parent closes
     │
     ▼
focus returns to original page button
```

Each overlay therefore restores focus to the context that was active **when that particular overlay opened**.

```text
Page
 │
 └── Button focused
       │
       ▼
   Parent opens
       │
       └── remembers Button
             │
             ▼
         Nested opens
             │
             └── remembers Parent control
                    │
                    ▼
                Nested closes
                    │
                    └── restores Parent control
                           │
                           ▼
                     Parent closes
                           │
                           └── restores Button
```

This is what makes focus restoration compose correctly with nested overlays.

---

## Escape and Keyboard Dismissal

Escape dismissal is controlled by `closeOnEscape`, which defaults to enabled.

```js
await openModal(render, {
  closeOnEscape: true,
});
```

Escape is handled globally, but only the **top-most** overlay is considered.

| Condition                              | Behavior                                                     |
| -------------------------------------- | ------------------------------------------------------------ |
| Stack is empty                         | No-op                                                        |
| Top overlay has `closeOnEscape: true`  | Top overlay closes with `false`                              |
| Top overlay has `closeOnEscape: false` | Escape does not close it                                     |
| Lower overlay allows Escape            | It does not receive Escape while another overlay is above it |

For example:

```text
Overlay A
Overlay B  ← top-most

Escape
  │
  ▼
Overlay B closes
```

A does not also receive the same Escape event.

After B closes, A becomes top-most and can respond to a later Escape according to A's own configuration.

Escape dismissal resolves the closing overlay's Promise with `false`.

### Preventing Keyboard Dismissal

For an overlay that must remain open until an explicit application action:

```js
await openModal(render, {
  closeOnEscape: false,
  closeOnBackdrop: false,
});
```

This removes the two automatic dismissal paths while leaving the application's own close controls available.

Do not remove the explicit close or cancel action merely because Escape is enabled. Escape is a convenience mechanism, not a replacement for an accessible in-dialog dismissal control.

See [Closing Overlays](./closing.md) and [Overlay Stacking](./stacking.md).

---

## Backdrop and Pointer Interaction

When a backdrop is rendered, it provides the visual and pointer boundary around the dialog.

With the default options:

```js
{
  renderBackdrop: true,
  closeOnBackdrop: true,
}
```

clicking the backdrop closes the top-most overlay with `false`.

The runtime's structural layout keeps pointer interaction directed toward the dialog panel when the user clicks inside the dialog.

The relevant structure is:

```text
overlay host
    │
    ├── backdrop
    │
    └── layer
          │
          └── panel
               │
               └── application content
```

Backdrop dismissal is a pointer interaction. It should not be treated as the only accessible way to leave the dialog.

Provide an explicit, focusable Cancel or Close control inside the dialog:

```html
<button type="button" @on="click=cancel">
  Cancel
</button>
```

Keyboard and assistive-technology users should not have to depend on pointer-specific backdrop behavior.

---

## Accessible Names and Descriptions

The runtime provides the dialog role, but application content should communicate what the dialog is about.

A useful dialog normally has:

1. A clear title
2. Optional descriptive text
3. Clearly labeled actions

For example:

```js
template: () => html`
  <div
    class="dialog"
    aria-labelledby="dialog-title"
    aria-describedby="dialog-description"
  >
    <h2 id="dialog-title">
      Delete project?
    </h2>

    <p id="dialog-description">
      This permanently removes the project and its data.
    </p>

    <button type="button" @on="click=cancel">
      Cancel
    </button>

    <button type="button" @on="click=confirm">
      Delete
    </button>
  </div>
`,
```

The runtime does not automatically infer application-specific labels or descriptions. Supply the appropriate labeling attributes and visible content for the dialog's design.

The dialog should remain understandable even when the surrounding page is visually obscured by the overlay.

---

## Application Responsibilities

Udodi handles the structural mechanics, but accessibility is shared between the runtime and the application.

| Runtime responsibility               | Application responsibility                                   |
| ------------------------------------ | ------------------------------------------------------------ |
| `role="dialog"` on the overlay layer | Provide meaningful dialog content                            |
| `aria-modal="true"`                  | Provide an accessible name and description                   |
| `tabindex="-1"`                      | Provide appropriately labeled controls                       |
| Initial layer focus                  | Optionally move focus to a more appropriate control          |
| Focus trapping                       | Keep important actions focusable                             |
| Focus restoration                    | Keep invoking controls usable when possible                  |
| Top-most Escape handling             | Provide an explicit close/cancel path                        |
| Backdrop dismissal                   | Do not rely on backdrop as the only dismissal mechanism      |
| Structural overlay behavior          | Provide visible focus indicators                             |
| Modal stacking                       | Ensure nested dialogs remain understandable                  |
| Scroll locking                       | Ensure content remains usable at the intended viewport sizes |

The runtime can establish a safe focus and keyboard foundation, but it cannot determine whether a particular dialog's content is meaningful or understandable.

---

## Pattern: Accessible Confirmation Dialog

A confirmation dialog should have a clear title, useful description, and explicit actions:

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
    <div
      class="dialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-description"
    >
      <h2 id="confirm-title">
        Delete item?
      </h2>

      <p id="confirm-description">
        This action cannot be undone.
      </p>

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

With the default Overlay behavior:

* The overlay is exposed as a dialog.
* Focus moves into the dialog when it opens.
* Tab and Shift+Tab remain within the top-most overlay.
* Escape can dismiss the overlay.
* Backdrop click can dismiss the overlay.
* Dismissal through Escape or backdrop resolves with `false`.
* Focus is restored when the overlay closes.

The application supplies the meaningful title, description, and actions.

---

## Pattern: Initial Focus on a Form Field

A form dialog may benefit from focusing its first meaningful field immediately:

```js
const EditNameDialog = createComponent({
  name: "EditNameDialog",

  onMount(root) {
    root.querySelector("[data-autofocus]")?.focus();
  },

  methods: {
    cancel() {
      this.onConfirm?.(false);
    },

    save() {
      this.onConfirm?.(true);
    },
  },

  template: () => html`
    <div
      class="dialog"
      aria-labelledby="edit-name-title"
    >
      <h2 id="edit-name-title">
        Edit name
      </h2>

      <label>
        Name
        <input data-autofocus @bind="name" />
      </label>

      <button type="button" @on="click=cancel">
        Cancel
      </button>

      <button type="button" @on="click=save">
        Save
      </button>
    </div>
  `,
});
```

The runtime initially focuses the dialog layer. The component then moves focus to the designated field during its mount lifecycle.

This pattern is particularly useful when the primary purpose of the dialog is data entry.

Avoid automatically moving focus to a control when doing so would make the dialog harder to understand or would unexpectedly bypass useful introductory content.

---

## Nested Overlays

Accessibility behavior composes with the Overlay stack.

Suppose:

```text
ParentDialog
      │
      ▼
ConfirmDialog  ← top-most
```

While `ConfirmDialog` is open:

1. Focus moves into the confirmation layer.
2. The confirmation dialog owns the active focus trap.
3. Escape applies to the confirmation according to `closeOnEscape`.
4. The parent remains mounted underneath.
5. Focus does not cycle into the parent.
6. Closing the confirmation restores focus toward the parent context.
7. The parent becomes top-most again.
8. The parent's focus behavior resumes.

This means nested overlays do not require the application to manually coordinate multiple focus traps.

The application still needs to ensure that every layer has understandable content and a clear interaction path.

---

## Focus and the Overlay Stack

The most important rule for nested overlays is:

> **Only the top-most overlay owns active focus behavior.**

Consider:

```text
┌──────────────────────────┐
│      Nested overlay      │
│                          │
│   [Cancel]  [Confirm]    │
│                          │
│   ← active focus trap    │
├──────────────────────────┤
│      Parent overlay      │
│                          │
│      trap inactive       │
└──────────────────────────┘
```

The parent does not compete with the child for focus.

When the child closes:

```text
┌──────────────────────────┐
│      Parent overlay      │
│                          │
│   [Cancel]  [Continue]   │
│                          │
│   ← active focus trap    │
└──────────────────────────┘
```

The parent becomes active again.

This same top-most rule also governs Escape and `closeTopModal()`. See [Overlay Stacking](./stacking.md) for the complete stack model.

---

## What the Runtime Owns vs What You Own

| Runtime                     | Application                                     |
| --------------------------- | ----------------------------------------------- |
| `role="dialog"`             | Accessible name                                 |
| `aria-modal="true"`         | Accessible description                          |
| `tabindex="-1"`             | Meaningful dialog content                       |
| Initial focus on the layer  | Optional control-specific initial focus         |
| Focusable-element discovery | Correctly implemented interactive controls      |
| Focus trap                  | Focus indicators and visual keyboard feedback   |
| Focus restoration           | Usable invoking controls                        |
| Top-most Escape behavior    | Explicit close/cancel actions                   |
| Backdrop dismissal          | Appropriate dismissal semantics                 |
| Nested focus ownership      | Understandable nested dialog content            |
| Structural overlay behavior | Contrast, spacing, animation, and visual design |

The runtime provides the **interaction infrastructure**. The application provides the **accessible experience**.

---

## Common Mistakes

| Mistake                                                           | Result                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Providing no meaningful dialog title or accessible name           | Assistive-technology users may not know what the dialog represents.                  |
| Using an unlabeled icon-only close control                        | The control may not communicate its purpose clearly.                                 |
| Relying only on backdrop click                                    | Keyboard and assistive-technology users need an explicit dismissal path.             |
| Relying only on Escape                                            | Escape can be disabled and is not a substitute for a visible Close or Cancel action. |
| Disabling `focusTrap` on a conventional modal                     | Focus can leave the modal and move into page content behind it.                      |
| Making actions non-focusable                                      | They can be skipped by keyboard navigation and the focus trap.                       |
| Expecting the runtime to infer the dialog's title                 | Application content must provide the appropriate labeling information.               |
| Opening a nested overlay without meaningful content               | The top-most layer can become difficult to understand independently.                 |
| Automatically focusing an arbitrary control                       | Users may be placed in an unexpected part of the dialog.                             |
| Removing the invoking control immediately after close             | Focus restoration may have no useful target.                                         |
| Treating backdrop dismissal as an accessibility feature by itself | Pointer dismissal does not replace keyboard-accessible interaction.                  |

---

## Accessibility Checklist

Before shipping an overlay, verify:

* [ ] The dialog has a clear accessible name.
* [ ] The purpose of the dialog is understandable from its content.
* [ ] Important descriptive text is available when necessary.
* [ ] Confirm, Cancel, and Close actions use focusable controls.
* [ ] There is an explicit in-dialog dismissal path.
* [ ] Focus moves into the overlay when it opens.
* [ ] The focus trap remains enabled for conventional modal dialogs.
* [ ] A specific initial focus target is used only when it improves the interaction.
* [ ] Keyboard users can reach every important action.
* [ ] Visible focus indicators are present.
* [ ] Nested overlays have their own understandable titles and actions.
* [ ] Focus returns to a meaningful location after closing.
* [ ] Escape behavior matches the intended dismissal policy.

---

## Next Steps

| Goal                                                    | Guide                                 |
| ------------------------------------------------------- | ------------------------------------- |
| Configure focus trap, Escape, and backdrop behavior     | **[Overlay Options](./options.md)**   |
| Understand nested overlays and top-most focus ownership | **[Overlay Stacking](./stacking.md)** |
| Understand close paths and dismissal results            | **[Closing Overlays](./closing.md)**  |
| Open overlays and work with the Promise API             | **[Opening Overlays](./opening.md)**  |
| Review the complete Overlay model                       | **[Overlay Overview](./overview.md)** |

For precise public API signatures, see the **[Overlay API Reference](../api/overlay.md)**.
