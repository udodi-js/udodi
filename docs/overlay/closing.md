# Closing Overlays

An open overlay can be closed from its content, through the public closing APIs, or automatically by the runtime when backdrop or Escape closing is enabled.

Closing is directly connected to the Promise returned by `openModal()`: the value supplied to the close operation becomes the value with which that Promise resolves.

This guide covers:

* Closing an overlay from its content with `close(result)`
* Closing the top-most overlay with `closeTopModal()`
* Backdrop closing
* Escape closing
* Close results and defaults
* Idempotent closing
* Focus restoration and scroll unlocking
* Common closing patterns

For opening behavior, see **[Opening Overlays](./opening.md)**.

---

## Close Paths

Udodi provides several ways to close an open overlay:

| Path | When it applies | Default result |
| --- | --- | --- |
| **`close(result)`** | The helper supplied to the overlay's render function | `false` |
| **`closeTopModal(result?)`** | Code that should close the current top-most overlay | `false` |
| **Backdrop click** | The rendered backdrop is clicked and `closeOnBackdrop` is enabled | `false` |
| **Escape** | Escape is pressed, the overlay is top-most, and `closeOnEscape` is enabled | `false` |

Regardless of which path initiates the close, the target overlay goes through the same closing lifecycle.

The important distinction is **which overlay is targeted** and **which result is returned**.

---

## Closing from Content with `close()`

When `openModal()` is called, its render function receives a `close(result)` helper:

```js
const result = await openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
  });
});
```

The helper is associated with that particular overlay. Calling it closes that overlay and resolves the Promise returned by its `openModal()` call.

### Through a Component Callback Prop

For interactive overlay content, pass `close` into the component as a callback prop and invoke that callback from component methods:

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
      <button type="button" @on="click=cancel">
        Cancel
      </button>
      <button type="button" @on="click=confirm">
        Confirm
      </button>
    </div>
  `,
});

const result = await openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
  });
});
```

Here the flow is:

```text
openModal((close) => ConfirmDialog({ onConfirm: close }))
        │
        ▼
 user clicks Confirm
        │
        ▼
 confirm() → this.onConfirm(true)
        │
        ▼
 close(true)
        │
        ▼
 Promise resolves with true
```

and:

```text
user clicks Cancel
        │
        ▼
 cancel() → this.onConfirm(false)
        │
        ▼
 close(false)
        │
        ▼
 Promise resolves with false
```

This keeps the overlay lifecycle outside the component while allowing the component to decide which result to return.

The template continues to use Udodi's normal directive syntax:

```html
<button type="button" @on="click=confirm">
  Confirm
</button>
```

It does not need to call `close()` directly or contain arbitrary JavaScript.

### Close Results

`close()` accepts an optional result:

```js
close(result?)
```

The result can be any value appropriate for the application:

```js
close(true);
close(false);
close("approved");
close({ id: 42, action: "save" });
close(); // same as close(false)
```

The value is passed directly to the Promise returned by `openModal()`:

```js
const result = await openModal((close) => {
  return ApproveDialog({
    onConfirm: close,
  });
});

console.log(result);
// value passed to close(...)
```

This makes the overlay API useful for request/response-style UI.

For example:

```js
const choice = await openModal((close) => {
  return UnsavedChangesDialog({
    onChoose: close,
  });
});

if (choice === "save") {
  // save...
} else if (choice === "discard") {
  // discard...
}
```

The dialog can return an application-defined value such as `"save"` or `"discard"`, and the caller can branch on it.

---

## `closeTopModal()`

Use `closeTopModal(result?)` when the intent is to close whichever overlay is currently at the top of the stack:

```js
import { closeTopModal } from "udodi";

closeTopModal(true);
closeTopModal(); // result defaults to false
```

If the stack contains overlays:

```text
     Bottom
       │
       ▼
┌─────────────┐
│   Modal A   │
├─────────────┤
│   Modal B   │ ◄─── top-most
└─────────────┘
```

then:

```js
closeTopModal(false);
```

closes Modal B, not Modal A.

The underlying overlay remains open and becomes the top-most overlay.

### Empty Stack

If no overlay is open, `closeTopModal()` does nothing:

| Stack state | Behavior |
| --- | --- |
| One or more overlays | Closes the top-most entry |
| Empty | No-op |

This makes it safe to use from application-level dismissal logic:

```js
methods: {
  onGlobalCancel() {
    closeTopModal(false);
  },
}
```

Use `closeTopModal()` when you intentionally want top-most behavior.

See **[Overlay Stacking](./stacking.md)**.

---

## Backdrop Closing

By default, overlays render a backdrop and allow a click on that backdrop to close the overlay:

```js
await openModal(
  (close) => ConfirmDialog({ onConfirm: close }),
  {
    renderBackdrop: true,
    closeOnBackdrop: true,
  },
);
```

A click on `[udodi-overlay-backdrop]` closes the corresponding overlay with `false`.

The behavior is:

| Condition | Result |
| --- | --- |
| Backdrop rendered + `closeOnBackdrop: true` | Backdrop click closes the overlay |
| `closeOnBackdrop: false` | Backdrop remains, but clicking it does not close the overlay |
| `renderBackdrop: false` | No backdrop exists, so backdrop closing cannot occur |
| Click inside the panel | Does not trigger backdrop closing |

Backdrop closing always uses `false` as its result.

If the application needs a different result, the overlay content should use its `close(result)` callback.

For example:

```js
const confirmed = await openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
  });
});

// Confirm button → true
// Backdrop click → false
```

can return `true`, while an accidental or intentional backdrop dismissal still returns `false`.

---

## Escape Closing

Escape closing is handled by the runtime's global keyboard listener:

```js
await openModal(
  (close) => ConfirmDialog({ onConfirm: close }),
  {
    closeOnEscape: true,
  },
);
```

When Escape is pressed, the runtime considers the top-most overlay.

| Condition | Behavior |
| --- | --- |
| Stack is empty | Nothing happens |
| Top overlay has `closeOnEscape: true` | Top overlay closes with `false` |
| Top overlay has `closeOnEscape: false` | Escape does not close the overlay |
| Lower overlay has Escape enabled | It does not receive Escape while another overlay is above it |

Only the **top-most** overlay can consume Escape.

For example:

```text
Modal A  (closeOnEscape: true)
    │
    ▼
Modal B  (closeOnEscape: true)  ←  Escape closes B only
```

After Modal B closes, Modal A can respond to subsequent Escape presses according to its own `closeOnEscape` setting.

Escape closing always resolves the target overlay's Promise with `false`.

---

## Close Results and Dismissal

Because backdrop and Escape use `false`, applications can conveniently treat `false` as the standard dismissal result:

```js
const result = await openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
  });
});

if (result === true) {
  // Explicit confirmation
} else {
  // Cancel, backdrop, Escape, or close() without a value
}
```

A useful convention is:

| Source | Typical result |
| --- | --- |
| Confirm action | Application-defined, often `true` |
| Cancel action | `false` |
| Backdrop | `false` |
| Escape | `false` |
| `close()` without a value | `false` |
| `closeTopModal()` without a value | `false` |

The runtime does not impose a meaning on application-defined results. It simply passes the value through to the corresponding `openModal()` Promise.

### Returning Multiple Outcomes

An overlay can return more than a simple boolean.

For example, a dialog might distinguish between saving, discarding, and cancelling:

```js
const UnsavedChangesDialog = createComponent({
  name: "UnsavedChangesDialog",

  methods: {
    chooseSave() {
      this.onChoose?.("save");
    },

    chooseDiscard() {
      this.onChoose?.("discard");
    },

    chooseCancel() {
      this.onChoose?.("cancel");
    },
  },

  template: () => html`
    <div class="dialog">
      <p>You have unsaved changes.</p>
      <button type="button" @on="click=chooseSave">Save</button>
      <button type="button" @on="click=chooseDiscard">Discard</button>
      <button type="button" @on="click=chooseCancel">Cancel</button>
    </div>
  `,
});

const choice = await openModal((close) => {
  return UnsavedChangesDialog({
    onChoose: close,
  });
});
```

The caller can then handle each outcome:

```js
switch (choice) {
  case "save":
    // save...
    break;
  case "discard":
    // discard...
    break;
  case "cancel":
    // explicit cancel
    break;
  default:
    // backdrop, Escape, or other dismissal (false)
    break;
}
```

Backdrop and Escape still return `false`, so the caller can distinguish an explicit dialog choice from an external dismissal if needed.

---

## What Happens When an Overlay Closes

All close paths converge on the same cleanup sequence as shown in the table below:

| Step | What the runtime does |
| --- | --- |
| **Mark closed** | Marks the entry closed so a second close path cannot run cleanup again. |
| **Unmount** | Unmounts the overlay instance. Component content runs its normal unmount process. |
| **Leave stack** | Removes the entry from the overlay stack. Any remaining overlay becomes top-most. |
| **Unlock scroll** | Releases this overlay's scroll lock when it had `lockScroll: true`. Unlock is reference-counted, so the document stays locked while another locking overlay is open. |
| **Restore focus** | Returns focus to the element that was active when the overlay opened. Restoration failures are ignored safely. |
| **Resolve Promise** | Resolves the Promise returned by `openModal()` with the close result. |

Code waiting with `await` continues after that resolution:

```js
const result = await openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
  });
});

// continues after the overlay closes
console.log(result);
```

---

## Idempotent Closing

Closing an overlay is idempotent.

Once a particular overlay has closed, attempting to close that same entry again has no effect.

For example:

```js
close(true);
close(false); // no-op for the same overlay entry
```

Only the first close takes effect.

The second call does **not**:

* Unmount the overlay again
* Remove another stack entry
* Restore focus again
* Unlock scrolling again
* Resolve the Promise a second time

This is important when multiple close paths can potentially occur close together; for example, when application code initiates a close while another event is also being processed.

---

## Closing from Outside the Overlay

Code outside the overlay's render function can dismiss the current top-most overlay with `closeTopModal()`:

```js
import { closeTopModal } from "udodi";

closeTopModal(false);
```

This is useful for application-level controls such as a global cancel action:

```js
methods: {
  onGlobalCancel() {
    closeTopModal(false);
  },
}
```

The distinction is important:

* Use **`close()`** when the overlay content knows the result it wants to return.
* Use **`closeTopModal()`** when external code simply wants to dismiss the current top layer.

---

## Pattern: Confirm Then Continue

A common pattern is to wait for a confirmation overlay before continuing an operation:

```js
async function removeItem(itemId) {
  const confirmed = await openModal((close) => {
    return ConfirmDialog({
      onConfirm: close,
      title: "Delete item?",
      message: "This action cannot be undone.",
    });
  });

  if (!confirmed) {
    return;
  }

  await api.deleteItem(itemId);
}
```

The control flow is:

```text
open confirm overlay
        │
        ▼
 await user decision
        │
        ├── false → return early
        │
        └── true  → continue destructive work
```

The important part is that the destructive operation does not continue until the Promise resolves with a truthy confirmation result.

---

## Pattern: Multiple Results

When a dialog has more than two meaningful outcomes, return a distinct value for each action:

```js
const choice = await openModal((close) => {
  return UnsavedChangesDialog({
    onChoose: close,
  });
});

switch (choice) {
  case "save":
    await saveDocument();
    break;
  case "discard":
    discardDocument();
    break;
  default:
    // cancel or dismissed
    break;
}
```

This is often clearer than encoding several states into a boolean.

The overlay system does not constrain the result type. The application decides what values represent its dialog outcomes.

---

## Common Mistakes

| Mistake | Result |
| --- | --- |
| Expecting backdrop or Escape to return a custom result | Both use `false`. Use `close(result)` for application-defined results. |
| Calling `close()` after the overlay has already closed | Safe no-op; the Promise is not resolved again. |
| Using `closeTopModal()` when a specific overlay should close | Only the top-most entry is affected. |
| Forgetting to `await openModal()` when its result matters | The caller continues before the user has made a choice. |
| Putting `() => close(false)` in `@on` | Invalid Udodi template DSL. Use a component method and callback prop. |
| Assuming closing one nested overlay unlocks scrolling immediately | Scroll locking is reference-counted; another locking overlay can keep the document locked. |
| Assuming Escape closes every open overlay | Only the top-most overlay can respond to Escape. |

---

## Choosing a Close API

A useful rule of thumb is:

| Situation | Use |
| --- | --- |
| Dialog content needs to return a result | **`close(result)`** |
| External code needs to dismiss the current overlay | **`closeTopModal(result?)`** |
| User clicks the backdrop | Runtime backdrop handling |
| User presses Escape | Runtime Escape handling |

In most component-driven dialogs, the normal pattern is:

```js
await openModal((close) => {
  return Dialog({
    onConfirm: close,
  });
});
```

This keeps the component's template and methods independent of the overlay's internal stack management.

---

## Next Steps

| Goal | Guide |
| --- | --- |
| Open overlays and work with the Promise | **[Opening Overlays](./opening.md)** |
| Configure backdrop and Escape behavior | **[Overlay Options](./options.md)** |
| Understand nested overlays and top-most behavior | **[Overlay Stacking](./stacking.md)** |
| Understand focus restoration and keyboard behavior | **[Accessibility](./accessibility.md)** |
| Review the complete Overlay model | **[Overlay Overview](./overview.md)** |

For precise public API signatures, see the **[Overlay API Reference](../api/overlay.md)**.
