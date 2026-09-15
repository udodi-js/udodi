# `@teleport`

The `@teleport` directive moves an element from its position in the component template to another location in the document.

The element itself is preserved; only its **DOM location** changes. Its subtree, bindings, event listeners, and component relationships remain attached to the element.

Use `@teleport` for UI that needs to escape its parent's layout, overflow, or stacking context, such as:

* dialogs and modals;
* dropdowns and popovers;
* tooltips;
* toasts;
* overlay menus.

## Basic Usage

```html
<div @teleport="#modal-root">
  Modal content
</div>
```

When the directive is processed, Udodi:

1. Resolves `#modal-root`.
2. Inserts a comment placeholder at the element's original position.
3. Moves the element into the target.
4. Registers cleanup with the current component scope.

The original element is not cloned or recreated.

## Targets

`@teleport` supports CSS selectors and the special `overlay` target.

| Value        | Destination                                         |
| ------------ | --------------------------------------------------- |
| CSS selector | First element matched by `document.querySelector()` |
| `overlay`    | Udodi's overlay root                                |

For example:

```html
<div @teleport="#modal-root">
  Modal
</div>

<div @teleport=".overlay-container">
  Popover
</div>

<div @teleport="overlay">
  Toast
</div>
```

### CSS Selectors

Any valid selector accepted by `document.querySelector()` can be used:

```html
<div @teleport="#app-overlay">...</div>
<div @teleport=".portal-root">...</div>
```

Only the **first matching element** is used.

If the selector is invalid or does not match an element, Udodi throws an `@teleport` error; see [Error Handling](#error-handling). The element is left in its original location; no placeholder is created, no cleanup is registered, and the `@teleport` attribute is not removed.

### `overlay`

The special value `overlay` uses Udodi's managed overlay root:

```html
<div @teleport="overlay">
  Overlay content
</div>
```

The overlay root is created when it is first requested.

This is the recommended target when the application does not need to provide its own portal container.

## Example

```js
import { createComponent, html, render } from "udodi";

const Dialog = createComponent({
  name: "Dialog",

  state() {
    return {
      open: false,
    };
  },

  methods: {
    openDialog() {
      this.open = true;
    },

    closeDialog() {
      this.open = false;
    },
  },

  template: html`
    <div>
      <button @on="click=openDialog">
        Open
      </button>

      <div @if="open">
        <div @teleport="overlay" class="dialog">
          <p>Hello from the overlay root.</p>

          <button @on="click=closeDialog">
            Close
          </button>
        </div>
      </div>
    </div>
  `,
});

render(Dialog(), "#app");
```

Here, `@if` controls the **lifetime** of the dialog, while `@teleport` controls its **DOM location**.

When `open` becomes truthy, the dialog is mounted and then moved to the overlay root. When `open` becomes falsy, the `@if` branch is unmounted, which also cleans up the teleported element.

## How It Works

Conceptually:

```text
Component template
       │
       ▼
<div @teleport="overlay">
       │
       ▼
Insert comment placeholder
       │
       ▼
Resolve teleport target
       │
       ▼
Move element to target
       │
       ▼
Register scope cleanup
```

The original element is moved with `appendChild()`:

```text
Original parent
      │
      ├── comment placeholder
      │
      └── other content

Overlay root
      │
      └── teleported element
```

The placeholder remains at the original location while the element lives under the target.

The placeholder does **not** cause the element to return automatically to its original location. It provides a stable marker for the framework's lifecycle bookkeeping.

## Lifecycle and Cleanup

Teleportation is tied to the scope in which the directive is processed.

When that scope is disposed, Udodi:

1. Removes the placeholder if it is still connected.
2. Removes the teleported element if it is still connected.
3. Removes the element from the teleport registry.

This means a teleported element does not remain in the document after its owning component or structural branch is destroyed.

```text
Component destroyed
       │
       ├── remove teleport placeholder
       ├── remove teleported element
       └── unregister teleport
```

This is particularly important when `@teleport` is used inside `@if` or another scoped structure.

## One-Shot Behavior

`@teleport` is **not reactive**.

The target is resolved when the directive is processed:

```html
<div @teleport="overlay">
  Content
</div>
```

Changing component state does not cause the element to be teleported to another target.

If the application needs different targets, the structural lifecycle should be controlled explicitly, for example by conditionally mounting different elements.

## With `@if`

`@if` and `@teleport` solve different problems:

```html
<div @if="open">
  <div @teleport="overlay">
    Dialog
  </div>
</div>
```

`@if` determines **whether the content exists**.

`@teleport` determines **where the content exists in the DOM**.

This makes the combination useful for dialogs and other temporary overlays:

```text
open = false
    │
    └── dialog does not exist

open = true
    │
    ▼
@if mounts dialog
    │
    ▼
@teleport moves dialog
    │
    ▼
overlay root
```

When `open` becomes false, the `@if` branch is unmounted and the teleported element is removed.

## With `@show`

`@show` controls visibility without mounting or unmounting the element:

```html
<div @teleport="overlay" @show="open">
  Menu
</div>
```

Teleport still happens once, while `@show` subsequently controls the element's `hidden` state.

The distinction is:

| Directive   | Controls                |
| ----------- | ----------------------- |
| `@teleport` | DOM location            |
| `@if`       | Mounting and unmounting |
| `@show`     | Visibility              |

Use `@if` when the overlay should only exist while active. Use `@show` when the teleported element should remain mounted.

## Error Handling

`@teleport` treats missing targets, missing parents, and duplicate registration as **hard failures**. This avoids leaving the DOM in an inconsistent state.

Errors are reported through the directive error helper and include the component context when available:

```text
@teleport: <message>
```

(or the equivalent formatted message produced by `directiveMessage(context, "@teleport", …)`).

### Missing or Invalid Targets

If a selector does not resolve to an element (or is otherwise invalid):

```html
<div @teleport="#does-not-exist">
  Content
</div>
```

Udodi:

* throws an `@teleport` error (`Target not found: …`);
* leaves the element in its original location;
* does not create a placeholder;
* does not register teleport cleanup;
* does not remove the `@teleport` attribute.

The same applies when a selector cannot be processed by `document.querySelector()`.

### Missing Parent

If the element has no parent node at the time of processing, Udodi throws:

```text
@teleport: Element has no parent node.
```

No placeholder is created and the element is left untouched.

### Duplicate Registration

Udodi prevents the same element from being teleported more than once.

If an element has already been registered for teleportation, subsequent processing throws:

```text
@teleport: Element is already teleported. Duplicate @teleport is not allowed.
```

This protects against duplicate lifecycle registrations and duplicate cleanup handlers.

Because the failure occurs before any DOM mutation, a failed teleport never partially applies.

## Nested Content

Teleport moves the element together with its entire subtree:

```html
<div @teleport="overlay">
  <h2 @text="title"></h2>

  <button @on="click=close">
    Close
  </button>
</div>
```

The child nodes are not individually teleported.

Existing bindings and event listeners remain associated with the moved DOM subtree because the element itself is moved rather than recreated.

Nested components can also be used inside teleported content.

## Teleport and Component Boundaries

Teleport changes the DOM position of an element but does not change the component context that owns it.

For example:

```html
<div @teleport="overlay">
  <button @on="click=close">
    Close
  </button>
</div>
```

The `close` handler remains bound to the same component context after the element is moved.

Teleport is therefore a **DOM-placement mechanism**, not a context or component-boundary mechanism.

## Behavior

`@teleport`:

* Accepts a CSS selector or the special `overlay` target.
* Resolves the target once during binding.
* Uses `document.querySelector()` for normal selectors.
* Uses Udodi's overlay root for `overlay`.
* Moves the original element rather than cloning it.
* Inserts a comment placeholder at the original location.
* Registers lifecycle cleanup with the current scope.
* Removes the teleported element during scope cleanup if it is still connected.
* Removes the placeholder during cleanup.
* Prevents duplicate teleport registration (throws on duplicates).
* Throws when the target is missing or invalid, when the element has no parent, or when a duplicate is detected.
* Removes `@teleport` after a successful teleport.
* Does not reactively change the teleport target.
* On failure, leaves the element in place with no placeholder, no cleanup registration, and the attribute intact.

## Syntax Summary

| Form                      | Behavior                                      |
| ------------------------- | --------------------------------------------- |
| `@teleport="#modal-root"` | Move to the first `#modal-root` match         |
| `@teleport=".portal"`     | Move to the first `.portal` match             |
| `@teleport="overlay"`     | Move to Udodi's overlay root                  |
| Missing target            | Throw an error and leave the element in place |
| Invalid selector          | Throw an error and leave the element in place |
| No parent node            | Throw an error and leave the element in place |
| Duplicate `@teleport`     | Throw an error                                |

## Constraints

| Rule                | Detail                                              |
| ------------------- | --------------------------------------------------- |
| One-shot            | Target resolution occurs once during binding        |
| Target              | CSS selector or `overlay`                           |
| Selector resolution | Uses `document.querySelector()`                     |
| Original element    | Moved, not cloned                                   |
| Placeholder         | Comment remains at the original position            |
| Cleanup             | Teleported content is removed with its owning scope |
| Reactivity          | `@teleport` does not retarget reactively            |
| Failed target       | Element remains in its original location            |
| Missing parent      | Hard failure (throws)                               |
| Duplicate           | Hard failure (throws)                               |
| Runtime attribute   | Removed after a successful teleport                 |
| Error reporting     | Uses `directiveMessage(context, "@teleport", …)`    |

## Minimal Example

```js
import { createComponent, html, render } from "udodi";

const Toast = createComponent({
  name: "Toast",

  template: html`
    <div @teleport="overlay" class="toast">
      Saved successfully.
    </div>
  `,
});

render(Toast(), "#app");
```

The toast is created as part of the component template but is moved into Udodi's overlay root during binding.

When the `Toast` component is destroyed, the teleported element is removed as part of its scope cleanup.
