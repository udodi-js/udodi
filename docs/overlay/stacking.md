# Overlay Stacking

Udodi manages open overlays as a stack. While multiple overlays can exist simultaneously, single-active-layer behaviors such as Escape dismissal, focus trapping, and `closeTopModal()` apply strictly to the top-most overlay.

Each overlay remains an independent entry in the stack. It has its own close lifecycle, Promise, options, and focus state.

This guide covers:

* How the overlay stack works
* Opening nested overlays
* Top-most ownership of Escape and focus
* Closing a nested overlay and returning to its parent
* Scroll locking across nested overlays
* DOM order and `zIndex`
* Nested versus sequential overlay flows
* Common stacking mistakes

For opening, closing, and configuration, see:

* [Opening Overlays](./opening.md)
* [Closing Overlays](./closing.md)
* [Overlay Options](./options.md)

---

## The Overlay Stack

Every call to `openModal()` creates an overlay entry and pushes it onto the internal stack.

Closing an overlay removes that entry.

```text
  openModal()
      │
      ▼
  push entry
      │
      ▼
┌─────────────────┐
│ Overlay C       │ ← top-most
├─────────────────┤
│ Overlay B       │
├─────────────────┤
│ Overlay A       │ ← first opened
└─────────────────┘
      │
      ▼
  close path
      │
      ▼
  remove entry
```

Conceptually, the stack is ordered from the first opened overlay at the bottom to the most recently opened overlay at the top:

```text
┌─────────────────────────────┐
│ Overlay C  ← top-most       │
│            Escape           │
│            focus trap       │
│            closeTopModal()  │
├─────────────────────────────┤
│ Overlay B                   │
├─────────────────────────────┤
│ Overlay A  ← first opened   │
└─────────────────────────────┘
```

| Position     | Role                                                                     |
| ------------ | ------------------------------------------------------------------------ |
| **Bottom**   | Earliest open overlay; becomes active again when overlays above it close |
| **Middle**   | Remains mounted but does not own top-most interactions                   |
| **Top-most** | Owns Escape, focus trapping, and `closeTopModal()`                       |

The stack is global to the page. All overlays opened through `openModal()` share the same stack and the same `#udodi-overlay-root`.

---

## Opening Nested Overlays

An overlay can open another overlay while it remains open.

This creates a nested stack:

```text
ParentDialog
     │
     ▼
NestedDialog  ← top-most
```

For example:

```js
import { createComponent, html, openModal } from "udodi";

const NestedDialog = createComponent({
  name: "NestedDialog",

  methods: {
    dismiss() {
      this.onConfirm?.(false);
    },

    accept() {
      this.onConfirm?.(true);
    },
  },

  template: () => html`
    <div class="dialog">
      <p>Nested confirmation</p>

      <button type="button" @on="click=dismiss">
        Cancel
      </button>

      <button type="button" @on="click=accept">
        OK
      </button>
    </div>
  `,
});

const ParentDialog = createComponent({
  name: "ParentDialog",

  methods: {
    cancel() {
      this.onConfirm?.(false);
    },

    async openNested() {
      const nestedResult = await openModal((close) => {
        return NestedDialog({
          onConfirm: close,
        });
      });

      // The parent remains open underneath.
      if (nestedResult) {
        // Handle nested confirmation.
      }
    },
  },

  template: () => html`
    <div class="dialog">
      <p>Parent dialog</p>

      <button type="button" @on="click=openNested">
        Open nested
      </button>

      <button type="button" @on="click=cancel">
        Close parent
      </button>
    </div>
  `,
});

await openModal((close) => {
  return ParentDialog({
    onConfirm: close,
  });
});
```

The important part is that the nested `openModal()` does **not** replace the parent overlay.

Instead:

```text
Before nested open:

ParentDialog  ← top-most


After nested open:

ParentDialog
NestedDialog  ← top-most
```

Both entries remain in the stack.

The parent remains mounted while the nested overlay is active.

---

## The Top-Most Rule

The stack establishes a single active overlay for interactions that should not be handled by multiple layers simultaneously.

The **top-most entry owns**:

* Escape handling
* Focus trapping
* `closeTopModal()`

Underlying overlays remain open, but they do not compete for these interactions.

```text
┌─────────────────────────┐
│ NestedDialog            │ ← owns top-level interactions
├─────────────────────────┤
│ ParentDialog            │ ← remains mounted
└─────────────────────────┘
```

This prevents a key press or global dismissal action from accidentally affecting several overlays at once.

---

## Escape

Escape is handled by the runtime's global keyboard listener.

The runtime examines only the top entry in the stack.

| Stack state                          | Behavior                                                     |
| ------------------------------------ | ------------------------------------------------------------ |
| Empty                                | No-op                                                        |
| Top entry has `closeOnEscape: true`  | Top entry closes with `false`                                |
| Top entry has `closeOnEscape: false` | Escape does not close the top entry                          |
| Lower entry has Escape enabled       | It does not receive Escape while another overlay is above it |

For example:

```text
Overlay A
Overlay B  ← top-most

Escape
  │
  ▼
Overlay B closes
```

The runtime does **not** continue down the stack looking for another overlay that permits Escape.

If B has:

```js
{
  closeOnEscape: false,
}
```

then Escape leaves both B and A open.

Only after B closes does A become eligible to respond to a subsequent Escape press.

```text
Before:

Overlay A
Overlay B  ← top-most

After B closes:

Overlay A  ← top-most
```

A's own `closeOnEscape` option is then evaluated independently.

---

## Focus Trapping

Focus follows the same top-most rule.

When `focusTrap` is enabled, the runtime manages keyboard focus for the overlay's dialog layer. Only the top-most overlay's focus trap is active.

```text
Overlay A
Overlay B  ← active focus trap
```

While B is open:

* `Tab` cycles through B's focusable elements.
* `Shift+Tab` cycles backward through B's focusable elements.
* Focus does not move into A.
* A's focus trap does not compete with B.

When B closes:

```text
Overlay A  ← focus trap becomes active
```

A can then resume control of keyboard focus according to its own `focusTrap` option.

This is what allows nested dialogs to behave as independent modal layers rather than several simultaneously active focus traps.

See [Accessibility](./accessibility.md) for the complete focus model.

---

## `closeTopModal()`

`closeTopModal(result?)` always targets the current top-most overlay.

```js
import { closeTopModal } from "udodi";

closeTopModal(false);
```

Given:

```text
Overlay A
Overlay B
Overlay C  ← top-most
```

calling:

```js
closeTopModal();
```

closes C.

The stack becomes:

```text
Overlay A
Overlay B  ← now top-most
```

B then owns Escape, focus trapping, and subsequent `closeTopModal()` calls.

### Empty Stack

When no overlays are open:

```js
closeTopModal();
```

is a no-op.

| Stack               | Result                |
| ------------------- | --------------------- |
| One or more entries | Top-most entry closes |
| Empty               | Nothing happens       |

`closeTopModal()` should therefore be understood as a **stack operation**, not as a way to identify an arbitrary overlay.

If a particular overlay must be closed directly, use its `close()` helper or `closeModal()` with the appropriate entry.

See [Closing Overlays](./closing.md).

---

## Closing a Nested Overlay

Closing the top overlay removes **only that entry**.

Suppose the stack is:

```text
Overlay A
Overlay B
Overlay C  ← top-most
```

Closing C produces:

```text
Overlay A
Overlay B  ← top-most
```

B does not reopen. It was never closed.

Likewise, A remains open throughout the entire operation.

The transition is therefore:

```text
C closes
   │
   ├── C unmounts
   ├── C leaves the stack
   ├── C releases its scroll lock, if any
   ├── C restores its previous focus
   └── C's Promise resolves
             │
             ▼
        B becomes top-most
```

This distinction matters when using nested overlays: **closing a child returns control to the existing parent; it does not restart the parent.**

---

## Each Overlay Has Its Own Lifecycle

Stack membership does not merge overlay lifecycles.

Every `openModal()` call has its own:

* Promise
* `close(result)` helper
* options
* mounted instance
* previous active element used for focus restoration
* close state

For example:

```js
const outer = openModal((close) => {
  return OuterDialog({
    onConfirm: close,
  });
});

const innerResult = await openModal((close) => {
  return InnerDialog({
    onConfirm: close,
  });
});
```

The inner Promise resolves when the inner overlay closes.

The outer Promise remains pending until the outer overlay itself closes.

```text
Outer Promise ──────────────────────────────── pending
                                                  │
Inner Promise ────── pending ──► resolved         │
                                    │             │
                                    ▼             │
                              inner closes        │
                                                  │
                            outer remains open ───┘
```

Closing the inner overlay therefore does not resolve the outer Promise.

---

## Returning to the Underlying Overlay

Consider a parent overlay that opens a confirmation overlay:

```text
ParentDialog
     │
     ▼
ConfirmDialog  ← top-most
```

When `ConfirmDialog` closes:

```text
ConfirmDialog
     │
     ▼
removed
     │
     ▼
ParentDialog  ← top-most again
```

The parent remains mounted throughout.

This makes nested overlays useful for workflows such as:

* A form opening a confirmation dialog
* A settings dialog opening a picker
* A dialog opening a secondary information dialog
* A wizard opening a confirmation step

The child can return a result to the code that opened it:

```js
const confirmed = await openModal((close) => {
  return ConfirmDialog({
    onConfirm: close,
  });
});

if (confirmed) {
  // Continue the parent operation.
}
```

The parent overlay itself remains open while awaiting the nested Promise.

---

## Scroll Lock Across Nested Overlays

Scroll locking is independent of top-most ownership.

It is **reference-counted**, so every overlay with `lockScroll: true` contributes to the lock count.

```text
open A (lockScroll: true)
        │
        ▼
count = 1
        │
        ▼
document locked

open B (lockScroll: true)
        │
        ▼
count = 2
        │
        ▼
document still locked

close B
        │
        ▼
count = 1
        │
        ▼
document still locked

close A
        │
        ▼
count = 0
        │
        ▼
document scrolling restored
```

The rule is:

| Situation                                        | Document scrolling                |
| ------------------------------------------------ | --------------------------------- |
| At least one open overlay has `lockScroll: true` | Locked                            |
| No open overlay requires scroll locking          | Restored                          |
| An overlay has `lockScroll: false`               | It does not affect the lock count |

For example:

```js
await openModal(renderA, {
  lockScroll: true,
});

await openModal(renderB, {
  lockScroll: false,
});
```

Closing B does not unlock the document because A still owns a scroll lock.

Likewise, closing A while B remains open does not unlock the document if another locking overlay exists.

See [Overlay Options](./options.md).

---

## Host Order and DOM Stacking

All overlays are mounted under the shared:

```html
<div id="udodi-overlay-root"></div>
```

Each `openModal()` call creates another overlay host under this root.

Conceptually:

```html
<div id="udodi-overlay-root">
  <!-- Overlay A host -->
  <div udodi-overlay-host>
    ...
  </div>

  <!-- Overlay B host -->
  <div udodi-overlay-host>
    ...
  </div>

  <!-- Overlay C host -->
  <div udodi-overlay-host>
    ...
  </div>
</div>
```

Later overlays are appended later in the DOM.

With the default structural `z-index`, this DOM order naturally corresponds to the overlay stack:

```text
A opened first
    │
    ▼
A host

B opened later
    │
    ▼
B host appears after A

C opened last
    │
    ▼
C host appears after B
```

Thus, the most recently opened overlay normally appears above earlier overlays.

---

## `zIndex`

The runtime gives overlay hosts a default structural `z-index` of `9999`.

An individual overlay can override it:

```js
await openModal(render, {
  zIndex: 12000,
});
```

The value applies to that overlay's host.

Each overlay is configured independently:

```js
await openModal(renderA, {
  zIndex: 10000,
});

await openModal(renderB, {
  zIndex: 12000,
});
```

B therefore has a higher host `z-index` than A.

Nested overlays do not automatically inherit a parent's explicit `zIndex`.

Use the option when the overlay needs to participate in an application-specific stacking hierarchy—for example, when other application UI already uses high stacking levels.

For normal nested overlays, the default stacking behavior is usually sufficient.

See [Overlay Options](./options.md).

---

## Nested vs Sequential Overlays

Nested and sequential overlays are different interaction patterns.

### Nested

The second overlay opens while the first remains open:

```text
Parent
   │
   ▼
Child  ← top-most
```

Use this when the parent should remain mounted and visible underneath the child.

```js
const result = await openModal((close) => {
  return ChildDialog({
    onConfirm: close,
  });
});
```

The parent remains open while this Promise is pending.

### Sequential

The first overlay closes before the second opens:

```text
Overlay A
   │
   ▼
A closes
   │
   ▼
Overlay B opens
```

For example:

```js
const step1 = await openModal((close) => {
  return StepOneDialog({
    onConfirm: close,
  });
});

if (!step1) {
  return;
}

const step2 = await openModal((close) => {
  return StepTwoDialog({
    onConfirm: close,
  });
});
```

The stack contains only one overlay at a time.

### Choosing Between Them

| Requirement                                                  | Pattern    |
| ------------------------------------------------------------ | ---------- |
| Parent must remain mounted underneath child                  | Nested     |
| Child temporarily takes control of the interaction           | Nested     |
| Each step is independent                                     | Sequential |
| Previous overlay should fully close before the next opens    | Sequential |
| User should return directly to the parent after child closes | Nested     |

The distinction is about **stack lifetime**, not merely visual appearance.

---

## Pattern: Confirmation on Top of a Form

A common nested flow is a form dialog that opens a confirmation dialog before completing a destructive operation:

```js
const FormDialog = createComponent({
  name: "FormDialog",

  methods: {
    cancel() {
      this.onConfirm?.(false);
    },

    async submit() {
      const confirmed = await openModal((close) => {
        return ConfirmDialog({
          onConfirm: close,
        });
      });

      if (!confirmed) {
        return;
      }

      // Continue with the submit operation.
      this.onConfirm?.(true);
    },
  },

  template: () => html`
    <div class="dialog">
      <!-- form fields -->

      <button type="button" @on="click=cancel">
        Cancel
      </button>

      <button type="button" @on="click=submit">
        Submit
      </button>
    </div>
  `,
});

const saved = await openModal((close) => {
  return FormDialog({
    onConfirm: close,
  });
});
```

The stack changes like this:

```text
Initial:

FormDialog  ← top-most


After Submit:

FormDialog
ConfirmDialog  ← top-most


After ConfirmDialog closes:

FormDialog  ← top-most
```

While the confirmation dialog is open:

* Escape applies to `ConfirmDialog`.
* Focus is trapped in `ConfirmDialog`.
* `closeTopModal()` closes `ConfirmDialog`.
* The form remains mounted underneath.
* Scroll remains locked if either overlay requires it.

Once the confirmation closes, the form resumes top-most ownership.

---

## Pattern: Nested Picker

Another common pattern is a dialog that opens a secondary picker:

```text
SettingsDialog
      │
      ▼
ColorPickerDialog  ← top-most
```

The picker can return its selection:

```js
const color = await openModal((close) => {
  return ColorPicker({
    onSelect: close,
  });
});

if (color) {
  // Apply selected color to the parent workflow.
}
```

The settings dialog remains open while the picker is active.

This is useful whenever the child interaction is conceptually part of the parent workflow but needs its own modal surface.

---

## Pattern: Sequential Steps

When the overlays represent independent steps rather than parent/child interactions, keep the stack shallow:

```js
const step1 = await openModal((close) => {
  return StepOneDialog({
    onConfirm: close,
  });
});

if (!step1) {
  return;
}

const step2 = await openModal((close) => {
  return StepTwoDialog({
    onConfirm: close,
  });
});
```

The lifecycle is:

```text
Step 1
  │
  ▼
close
  │
  ▼
stack empty
  │
  ▼
Step 2
```

There is no underlying Step 1 overlay to resume.

Use this pattern when keeping the previous overlay mounted would provide no benefit.

---

## What the Stack Owns vs What You Own

| Runtime                             | Application                                        |
| ----------------------------------- | -------------------------------------------------- |
| Pushes and removes overlay entries  | Decides when to open nested or sequential overlays |
| Determines the top-most entry       | Defines dialog content and interaction flow        |
| Routes Escape to the top-most entry | Configures `closeOnEscape` as needed               |
| Activates the top-most focus trap   | Provides appropriate focusable controls            |
| Implements `closeTopModal()`        | Chooses close results                              |
| Maintains shared overlay root       | Supplies `className` / `zIndex` when required      |
| Reference-counts scroll locking     | Chooses `lockScroll` per overlay                   |
| Restores focus for each entry       | Controls the dialog's internal focus experience    |
| Provides structural stacking        | Controls visual styling and animation              |

The runtime owns **stack mechanics**. The application owns **workflow semantics**.

---

## Common Mistakes

| Mistake                                                                          | Result                                                                                                                 |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Expecting Escape to close every open overlay                                     | Only the top-most overlay can respond to Escape.                                                                       |
| Expecting a lower overlay to receive focus while a higher one is open            | The top-most focus trap keeps keyboard focus in the active layer.                                                      |
| Assuming closing the top overlay always unlocks scrolling                        | Scroll locking is reference-counted; another locking overlay may remain.                                               |
| Assuming a nested child's Promise resolves the parent                            | Each `openModal()` call has its own Promise.                                                                           |
| Using sequential `await openModal()` calls when the parent should remain visible | The parent closes before the next overlay opens.                                                                       |
| Using nested overlays when the previous step should be completely gone           | The parent remains mounted underneath the child.                                                                       |
| Assuming `closeTopModal()` can target a lower overlay                            | It always targets the current top-most entry.                                                                          |
| Assuming nested overlays inherit `zIndex`                                        | Each host has its own stacking configuration.                                                                          |
| Assuming DOM order alone overrides explicit `zIndex` values                      | Explicit host `zIndex` values can change the visual stacking relationship.                                             |
| Treating the overlay stack as application state                                  | The stack is runtime infrastructure; application state should represent application-level data and workflow decisions. |

---

## A Useful Mental Model

Think of the stack as a set of independent modal sessions:

```text
                 TOP
                  │
                  ▼
        ┌──────────────────┐
        │  Overlay C       │
        │  Promise C       │
        │  close C         │
        │  options C       │
        │  focus C         │
        ├──────────────────┤
        │  Overlay B       │
        │  Promise B       │
        │  close B         │
        │  options B       │
        │  focus B         │
        ├──────────────────┤
        │  Overlay A       │
        │  Promise A       │
        │  close A         │
        │  options A       │
        │  focus A         │
        └──────────────────┘
                  │
                BOTTOM
```

The stack determines **which session is currently active for global modal behavior**.

It does not merge the sessions.

When C closes:

```text
C → removed
      │
      ▼
B → becomes top-most
      │
      ▼
A → remains underneath
```

That simple rule explains the behavior of nested overlays, Escape, focus trapping, `closeTopModal()`, and returning to an underlying dialog.

---

## Next Steps

| Goal                                                              | Guide                                   |
| ----------------------------------------------------------------- | --------------------------------------- |
| Open overlays and work with the Promise                           | **[Opening Overlays](./opening.md)**    |
| Close overlays and return results                                 | **[Closing Overlays](./closing.md)**    |
| Configure Escape, backdrop, scroll lock, focus trap, and `zIndex` | **[Overlay Options](./options.md)**     |
| Understand focus management and accessibility                     | **[Accessibility](./accessibility.md)** |
| Review the complete Overlay model                                 | **[Overlay Overview](./overview.md)**   |

For precise public API signatures, see the **[Overlay API Reference](../api/overlay.md)**.
