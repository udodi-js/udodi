# Overlay Options

`openModal()` accepts an optional configuration object that controls how an overlay behaves and how its host is presented:

```js
await openModal(render, options?);
```

The options control:

* Backdrop rendering
* Backdrop dismissal
* Escape dismissal
* Document scroll locking
* Keyboard focus trapping
* Host stacking order
* Host class names

Unspecified options use their defaults.

For the opening lifecycle, see [Opening Overlays](./opening.md).

For close behavior and close results, see [Closing Overlays](./closing.md).

---

## Options at a Glance

| Option            | Type               | Default     | Purpose                                                        |
| ----------------- | ------------------ | ----------- | -------------------------------------------------------------- |
| `renderBackdrop`  | `boolean`          | `true`      | Whether to render the dimmed backdrop.                         |
| `closeOnBackdrop` | `boolean`          | `true`      | Whether clicking the rendered backdrop closes the overlay.     |
| `closeOnEscape`   | `boolean`          | `true`      | Whether Escape closes the top-most overlay.                    |
| `lockScroll`      | `boolean`          | `true`      | Whether the overlay participates in document scroll locking.   |
| `focusTrap`       | `boolean`          | `true`      | Whether keyboard focus is trapped inside the top-most overlay. |
| `zIndex`          | `number \| string` | `undefined` | Inline `z-index` applied to the overlay host.                  |
| `className`       | `string`           | `undefined` | Additional class name(s) applied to the overlay host.          |

For example:

```js
await openModal(
  (close) => ConfirmDialog({ onConfirm: close }),
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

Only the options supplied are overridden; all others retain their defaults.

---

## `renderBackdrop`

**Default:** `true`

Controls whether the runtime creates the overlay backdrop.

```js
await openModal(render, {
  renderBackdrop: true,
});
```

When enabled, the runtime adds:

```html
<div udodi-overlay-backdrop></div>
```

inside the overlay host.

The backdrop is a full-viewport structural layer behind the dialog panel. The runtime provides its minimal structural presentation, including the default dimming.

### Values

| Value   | Behavior                          |
| ------- | --------------------------------- |
| `true`  | Render the backdrop.              |
| `false` | Do not create a backdrop element. |

### `renderBackdrop` and `closeOnBackdrop`

These options control different things:

* `renderBackdrop` determines **whether the backdrop exists**.
* `closeOnBackdrop` determines **whether clicking that backdrop closes the overlay**.

Therefore:

```js
{
  renderBackdrop: true,
  closeOnBackdrop: false,
}
```

renders a backdrop that cannot dismiss the overlay.

Conversely:

```js
{
  renderBackdrop: false,
  closeOnBackdrop: true,
}
```

does not provide a backdrop to click, so backdrop dismissal cannot occur.

`closeOnBackdrop` has no practical effect when `renderBackdrop` is `false`.

### When to Disable It

Use:

```js
{
  renderBackdrop: false,
}
```

when the overlay should appear without a dimmed viewport layer.

This can also be useful when the application provides its own full-screen visual treatment inside the overlay content.

---

## `closeOnBackdrop`

**Default:** `true`

Controls whether clicking the rendered backdrop closes the overlay.

```js
await openModal(render, {
  closeOnBackdrop: true,
});
```

When enabled, a click on `[udodi-overlay-backdrop]` closes the overlay with `false`.

### Behavior

| Condition                                   | Result                                                   |
| ------------------------------------------- | -------------------------------------------------------- |
| Backdrop rendered + `closeOnBackdrop: true` | Backdrop click closes the overlay with `false`.          |
| `closeOnBackdrop: false`                    | Backdrop remains visible but does not close the overlay. |
| `renderBackdrop: false`                     | No backdrop exists, so backdrop closing cannot occur.    |
| Click inside the panel                      | Does not trigger backdrop dismissal.                     |

Backdrop dismissal always resolves the `openModal()` Promise with `false`.

### Requiring an Explicit Action

For dialogs where accidental dismissal is undesirable, disable backdrop closing:

```js
await openModal(
  (close) => ConfirmDialog({ onConfirm: close }),
  {
    closeOnBackdrop: false,
  },
);
```

The dialog must then use an explicit close action or another enabled close mechanism.

For example, a confirmation dialog can return `true` from its Confirm action while backdrop dismissal is disabled.

See [Closing Overlays](./closing.md) for close-result conventions.

---

## `closeOnEscape`

**Default:** `true`

Controls whether the overlay can be closed with the Escape key.

```js
await openModal(render, {
  closeOnEscape: true,
});
```

Escape handling is global, but only the **top-most overlay** is considered.

### Behavior

| Condition                                   | Result                                                        |
| ------------------------------------------- | ------------------------------------------------------------- |
| No overlays are open                        | Nothing happens.                                              |
| Top-most overlay has `closeOnEscape: true`  | It closes with `false`.                                       |
| Top-most overlay has `closeOnEscape: false` | Escape does not close it.                                     |
| A lower overlay has Escape enabled          | It does not receive Escape while another overlay is above it. |

For example:

```text
Overlay stack

Modal A
Modal B  ← top-most

Escape
  │
  ▼
Modal B closes

Modal A  ← now top-most
```

Escape never skips the top overlay to close a lower entry.

### Disabling Escape

For dialogs that require an explicit application action, Escape can be disabled:

```js
await openModal(
  (close) => CriticalDialog({ onConfirm: close }),
  {
    closeOnEscape: false,
    closeOnBackdrop: false,
  },
);
```

With both options disabled, the overlay must be closed explicitly through its content or a closing API.

Escape dismissal always resolves the overlay's Promise with `false`.

See [Overlay Stacking](./stacking.md) for top-most behavior.

---

## `lockScroll`

**Default:** `true`

Controls whether the overlay participates in document scroll locking.

```js
await openModal(render, {
  lockScroll: true,
});
```

When enabled, the runtime prevents document scrolling by setting:

```js
document.body.style.overflow = "hidden";
```

while at least one open overlay requires scroll locking.

### Reference-Counted Locking

Scroll locking is **reference-counted**, rather than being tied to a single overlay.

```text
 open overlay A (lockScroll: true)
        │
        ▼
 lock count = 1
        │
        ▼
 scroll locked

 open overlay B (lockScroll: true)
        │
        ▼
 lock count = 2
        │
        ▼
 still locked

 close overlay B
        │
        ▼
 lock count = 1
        │
        ▼
 still locked

 close overlay A
        │
        ▼
 lock count = 0
        │
        ▼
 scroll restored
```

This is important for nested overlays: closing one locking overlay does not restore scrolling while another locking overlay remains open.

### Values

| Value   | Behavior                                              |
| ------- | ----------------------------------------------------- |
| `true`  | This overlay participates in the scroll-lock counter. |
| `false` | This overlay does not acquire a scroll lock.          |

Disable it when the overlay is intentionally non-blocking with respect to document scrolling:

```js
await openModal(render, {
  lockScroll: false,
});
```

For example, this can be appropriate for a lightweight notice or toast-style layer.

---

## `focusTrap`

**Default:** `true`

Controls whether keyboard focus is trapped inside the overlay's dialog layer.

```js
await openModal(render, {
  focusTrap: true,
});
```

The trap applies only while that overlay is the **top-most** entry on the stack.

When enabled:

1. Focus moves to the dialog layer after the overlay mounts.
2. `Tab` moves forward through focusable elements.
3. `Shift+Tab` moves backward.
4. Focus wraps around at the beginning and end.
5. If there are no focusable children, focus remains on the dialog layer.
6. Only the top-most overlay's focus trap is active.

The runtime considers anchors, buttons, enabled form controls, and elements with a non `-1` `tabindex`, while excluding hidden or non-visible nodes.

### Values

| Value   | Behavior                                    |
| ------- | ------------------------------------------- |
| `true`  | Install the focus trap on the dialog layer. |
| `false` | Do not install a focus trap.                |

For normal modal dialogs, the default should generally be retained.

Disable it only when the overlay is intentionally non-modal with respect to keyboard navigation:

```js
await openModal(render, {
  focusTrap: false,
});
```

See [Accessibility](./accessibility.md) for focus management and dialog semantics.

---

## `zIndex`

**Default:** `undefined`

The overlay host receives a structural default `z-index` of `9999`.

Providing `zIndex` overrides that value with an inline style:

```js
await openModal(render, {
  zIndex: 10000,
});
```

The runtime applies the value to the overlay host:

```js
host.style.zIndex = String(zIndex);
```

### Values

| Value                 | Behavior                                               |
| --------------------- | ------------------------------------------------------ |
| Omitted / `undefined` | Uses the structural default `z-index: 9999`.           |
| `number`              | Converted to a string and applied as inline `z-index`. |
| `string`              | Applied as the inline `z-index` value.                 |

For example:

```js
await openModal(render, {
  zIndex: 20000,
});
```

can place the overlay above application UI that uses a lower stacking level.

### Per-Overlay Configuration

`zIndex` belongs to the individual overlay host.

If several overlays are open, each host can have its own value:

```js
await openModal(renderA, {
  zIndex: 10000,
});

await openModal(renderB, {
  zIndex: 20000,
});
```

The second overlay does not inherit the first overlay's inline `zIndex`.

Use explicit values when an overlay must interact with other application-level stacking contexts.

---

## `className`

**Default:** `undefined`

Adds class name(s) to the overlay host.

```js
await openModal(render, {
  className: "confirm-overlay",
});
```

The resulting host includes the supplied class:

```html
<div udodi-overlay-host class="confirm-overlay">
  ...
</div>
```

When `className` is omitted or empty, the options path does not add a `class` attribute to the host.

### Styling Through `className`

`className` is applied to the **host**, not the dialog panel.

This makes it useful for overlay-specific styling:

```css
.confirm-overlay [udodi-overlay-backdrop] {
  background: rgba(0, 0, 0, 0.6);
}
```

The panel and its contents remain the responsibility of the application:

```css
.confirm-overlay [udodi-overlay-panel] {
  /* Application-specific panel presentation. */
}
```

The runtime intentionally provides only minimal structural CSS. Typography, colors, borders, shadows, transitions, animations, and themes remain application concerns.

---

## Combining Options

Options are independent and can be combined to create different overlay behaviors.

### Standard Dialog

The defaults already provide a conventional modal experience:

```js
await openModal(
  (close) => ConfirmDialog({ onConfirm: close }),
);
```

This enables:

* Backdrop
* Backdrop dismissal
* Escape dismissal
* Scroll locking
* Focus trapping

### Forced Confirmation

Require an explicit action:

```js
await openModal(
  (close) => ConfirmDialog({ onConfirm: close }),
  {
    closeOnBackdrop: false,
    closeOnEscape: false,
  },
);
```

The user cannot dismiss the overlay through the backdrop or Escape.

The dialog's explicit actions remain responsible for closing it.

### High Stacking Context

Give a particular overlay an application-specific stacking level and host class:

```js
await openModal(
  (close) => Dialog({ onConfirm: close }),
  {
    zIndex: 20000,
    className: "app-modal",
  },
);
```

The class can then be used to style this category of overlay independently.

### Non-Blocking Layer

An overlay can also be configured to behave less like a traditional modal:

```js
await openModal(
  (close) => Notice({ onDismiss: close }),
  {
    renderBackdrop: false,
    lockScroll: false,
    focusTrap: false,
    closeOnEscape: true,
  },
);
```

This removes the backdrop, leaves document scrolling enabled, and does not trap keyboard focus.

The Overlay system can therefore provide the host and lifecycle management without forcing every use case to behave like a conventional blocking dialog.

---

## Defaults and Overrides

Calling `openModal()` without an options object uses the complete default configuration:

```js
await openModal(render);
```

Equivalent behavior is:

```js
await openModal(render, {
  renderBackdrop: true,
  closeOnBackdrop: true,
  closeOnEscape: true,
  lockScroll: true,
  focusTrap: true,
  zIndex: undefined,
  className: undefined,
});
```

Options are partial overrides.

For example:

```js
await openModal(render, {
  closeOnBackdrop: false,
});
```

changes only backdrop dismissal.

The remaining options retain their defaults:

```text
renderBackdrop   →  true
closeOnBackdrop  →  false
closeOnEscape    →  true
lockScroll       →  true
focusTrap        →  true
zIndex           →  undefined
className        →  undefined
```

---

## How Options Affect the Host

The options that affect the overlay's DOM structure or host behavior map directly to the runtime-created elements:

```html
<div
  udodi-overlay-host
  class="/* className when set */"
  style="/* z-index when zIndex is set */"
>
  <!-- present when renderBackdrop is true -->
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

| Option            | Structural / behavioral effect                        |
| ----------------- | ----------------------------------------------------- |
| `renderBackdrop`  | Adds or omits `[udodi-overlay-backdrop]`.             |
| `className`       | Adds `class` to `[udodi-overlay-host]`.               |
| `zIndex`          | Adds inline `z-index` to `[udodi-overlay-host]`.      |
| `closeOnBackdrop` | Enables or disables backdrop click dismissal.         |
| `closeOnEscape`   | Allows or blocks Escape when this entry is top-most.  |
| `lockScroll`      | Includes or excludes the overlay from scroll locking. |
| `focusTrap`       | Installs or skips the keyboard focus trap.            |

The runtime owns these structural behaviors; application CSS owns the visual presentation.

---

## Option Interactions

Some options are intentionally related.

### `renderBackdrop` + `closeOnBackdrop`

`closeOnBackdrop` requires a rendered backdrop:

```text
renderBackdrop
      │
      ├── false ──► no backdrop
      │                 │
      │                 └── closeOnBackdrop has nothing to act on
      │
      └── true
           │
           ▼
      backdrop exists
           │
           ├── closeOnBackdrop: true
           │       └── click closes
           │
           └── closeOnBackdrop: false
                   └── click does nothing
```

### `closeOnEscape` + Stacking

Escape applies only to the top-most overlay:

```text
Modal A  ── closeOnEscape: true
Modal B  ── closeOnEscape: false  ← top

Escape
  │
  ▼
Modal B remains open
```

The runtime does not bypass `Modal B` to close `Modal A`.

### `lockScroll` + Nested Overlays

Scroll locking is shared:

```text
Modal A: lockScroll = true
Modal B: lockScroll = true

close Modal B
       │
       ▼
Modal A still locks scrolling
```

The document is unlocked only when the last locking overlay closes.

### `focusTrap` + Stacking

Only the top-most overlay traps focus.

When the top overlay closes, the next overlay becomes the active top layer and its own focus-trap behavior applies.

These interactions are what allow independent overlay entries to coexist safely in a nested stack.

---

## Common Mistakes

| Mistake                                                                         | Result                                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Setting `closeOnBackdrop: true` with `renderBackdrop: false`                    | There is no backdrop to click, so backdrop dismissal cannot occur.                               |
| Expecting Escape to close a lower overlay                                       | Only the top-most overlay can respond to Escape.                                                 |
| Using `lockScroll: false` and expecting the page to unlock                      | Another open overlay with `lockScroll: true` can keep scrolling locked.                          |
| Using `className` to style the panel directly                                   | `className` is applied to the host; target `[udodi-overlay-panel]` or descendants from the host. |
| Assuming `zIndex` is inherited by nested overlays                               | Each overlay host has its own configuration.                                                     |
| Disabling `focusTrap` on a normal modal without considering keyboard navigation | Focus can leave the dialog while it remains open.                                                |
| Assuming `renderBackdrop` controls whether the overlay is modal                 | It controls only backdrop rendering; Escape, focus, and scroll behavior are separate options.    |

---

## Choosing the Right Configuration

For most dialogs, start with the defaults:

```js
await openModal(render);
```

Override only the behavior the particular overlay requires.

| Requirement                           | Configuration            |
| ------------------------------------- | ------------------------ |
| Normal modal                          | Defaults                 |
| Prevent accidental backdrop dismissal | `closeOnBackdrop: false` |
| Prevent Escape dismissal              | `closeOnEscape: false`   |
| Keep the page scrollable              | `lockScroll: false`      |
| Allow focus to leave the overlay      | `focusTrap: false`       |
| Remove the backdrop entirely          | `renderBackdrop: false`  |
| Place above application UI            | Set `zIndex`             |
| Style a specific overlay host         | Set `className`          |

A good default principle is to **change behavioral options only when the overlay's interaction model requires it**. The built-in defaults provide the expected behavior for a conventional modal dialog.

---

## Next Steps

| Goal                                             | Guide                                   |
| ------------------------------------------------ | --------------------------------------- |
| Open overlays and work with the Promise          | **[Opening Overlays](./opening.md)**    |
| Close overlays and return results                | **[Closing Overlays](./closing.md)**    |
| Understand nested overlays and top-most behavior | **[Overlay Stacking](./stacking.md)**   |
| Understand focus trapping and restoration        | **[Accessibility](./accessibility.md)** |
| Review the complete Overlay model                | **[Overlay Overview](./overview.md)**   |

For precise public API signatures, see the **[Overlay API Reference](../api/overlay.md)**.
