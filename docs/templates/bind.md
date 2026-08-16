# `@bind`

The `@bind` directive creates a **two-way binding** between a form control and a writable path in the component context.

The binding has two directions:

- **Context → DOM** — the control reflects the current value of the bound expression.
- **DOM → Context** — user input writes the control's value back to the bound path.

`@bind` is intended for form controls whose value should remain synchronized with reactive component state.

---

## Basic Usage

```html
<input @bind="userName" />
```

If the component state contains:

```js
state() {
  return {
    userName: "Attamah",
  };
}
```

the input initially displays `Attamah`.

When the user edits the input, the new value is written back to `userName`. When `userName` changes reactively, the input is updated to match.

---

## Supported Controls

`@bind` determines how a control is synchronized from its element type.

| Control | DOM property | DOM event | Value written to context |
|---------|--------------|-----------|--------------------------|
| Text-like controls | `value` | `input` | Element value |
| `textarea` | `value` | `input` | Element value |
| `select` | `value` | `input` | Element value |
| Checkbox | `checked` | `change` | Boolean |
| Radio | `checked` | `change` | Radio value when selected |

For ordinary controls, the runtime reads and writes the element's `value`.

For checkboxes, the runtime synchronizes the element's `checked` property and writes a boolean.

For radios, the runtime compares the radio's `value` with the bound value. A selected radio writes its own value back to the bound path.

```html
<input type="text" @bind="email" />

<textarea @bind="bio"></textarea>

<select @bind="country">
  <option value="ng">Nigeria</option>
  <option value="gh">Ghana</option>
</select>

<input type="checkbox" @bind="subscribed" />

<input type="radio" name="plan" value="free" @bind="plan" />
<input type="radio" name="plan" value="pro" @bind="plan" />
```

---

## Two-Way Synchronization

A binding establishes a reactive read and an event-driven write.

```text
                 component state
                       │
                       │ reactive read
                       ▼
                    @bind
                       │
                       ▼
                    DOM control
                       │
                       │ input / change
                       ▼
                  writable path
                       │
                       ▼
                 component state
```

The context-to-DOM side is implemented as a reactive effect. When a dependency read by the binding changes, the control is synchronized again.

The DOM-to-context side is handled by an event listener:

- `input` for ordinary controls  
- `change` for checkboxes and radios  

---

## Binding State

A typical component can bind several controls directly to its state:

```js
import { createComponent, html, render } from "udodi";

const ProfileForm = createComponent({
  name: "ProfileForm",

  state() {
    return {
      userName: "Attamah",
      email: "",
      subscribed: true,
      plan: "pro",
    };
  },

  template: () => html`
    <form>
      <label>
        Name
        <input @bind="userName" />
      </label>

      <label>
        Email
        <input type="email" @bind="email" />
      </label>

      <label>
        <input type="checkbox" @bind="subscribed" />
        Subscribe to updates
      </label>

      <label>
        <input type="radio" name="plan" value="free" @bind="plan" />
        Free
      </label>

      <label>
        <input type="radio" name="plan" value="pro" @bind="plan" />
        Pro
      </label>
    </form>
  `,
});

render(ProfileForm(), "#app");
```

The controls and state remain synchronized through the binding.

---

## Nested Paths

`@bind` supports nested paths:

```html
<input @bind="user.name" />
<input @bind="settings.theme" />
```

with:

```js
state() {
  return {
    user: {
      name: "Attamah",
    },

    settings: {
      theme: "light",
    },
  };
}
```

When the user changes `user.name`, the runtime traverses the path and assigns the new value to the nested property.

Because Udodi's reactive state model is shallow, a deep mutation is followed by a root-level `touch()` so dependents of the root state property can be notified.

Conceptually:

```text
user.name = "Grace"
       │
       ▼
deep property mutation
       │
       ▼
touch("user")
       │
       ▼
notify dependents of user
```

This allows `@bind="user.name"` to work with nested state without requiring deep reactive proxies for every nested property.

---

## Writable Paths

The expression supplied to `@bind` should resolve to a writable path.

Typical examples are:

```html
<input @bind="userName" />
<input @bind="user.name" />
<input @bind="settings.theme" />
```

The runtime compiles path expressions into path segments and uses those segments when writing the updated value.

A binding to a value that cannot be written back is therefore not a valid two-way binding.

For example, a computed value should not be used as the destination of `@bind` unless the expression resolves to an actually writable property:

```html
<!-- Do not use a read-only computed value as the destination -->
<input @bind="fullName" />
```

Use a writable state path instead:

```html
<input @bind="firstName" />
```

or:

```html
<input @bind="user.name" />
```

---

## Read-Only Bindings

If the runtime cannot write the new value to the bound path, the DOM event does not update the component state.

The runtime checks whether the destination property is writable before assigning the value. It also handles invalid or unreachable paths without allowing the failed write to propagate.

A warning is emitted once for a binding when a write fails:

```text
[@bind] in Component "ProfileForm": Failed to write an updated value to expression: "fullName". This path or pipeline is read-only.
```

The warning is intentionally emitted only once for that binding rather than on every subsequent input event.

Prefer binding directly to writable state or another writable path.

---

## Text-Like Controls

For controls that use the `value` property, `null` and `undefined` are normalized to an empty string:

```js
value == null ? "" : value
```

Therefore:

```js
state() {
  return {
    userName: null,
  };
}
```

with:

```html
<input @bind="userName" />
```

results in an empty input rather than displaying `"null"` or `"undefined"`.

The runtime only updates the DOM value when it differs from the normalized value.

---

## Checkboxes

Checkboxes are bound through the DOM `checked` property.

```html
<input type="checkbox" @bind="enabled" />
```

The value written to the component is always a boolean: `true` or `false`.

The reactive side also converts the bound value to a boolean when synchronizing the checkbox:

```js
elem.checked = Boolean(value);
```

Example:

```js
const Settings = createComponent({
  name: "Settings",

  state() {
    return {
      notifications: true,
    };
  },

  template: () => html`
    <label>
      <input type="checkbox" @bind="notifications" />
      Enable notifications
    </label>
  `,
});
```

---

## Radio Buttons

Radio buttons use their `value` attribute as the bound value.

```html
<input type="radio" name="plan" value="free" @bind="plan" />
<input type="radio" name="plan" value="pro" @bind="plan" />
```

If:

```js
state() {
  return {
    plan: "pro",
  };
}
```

the `pro` radio is checked.

When the user selects `free`, the runtime writes:

```js
plan = "free";
```

The selected radio's DOM value is always converted to a string for comparison with the bound value.

A radio that is not selected does not write anything when its change handler runs.

---

## Reactive Updates

`@bind` is reactive on the context-to-DOM side.

For example:

```js
methods: {
  reset() {
    this.userName = "";
  },
},
```

with:

```html
<input @bind="userName" />
<button @on="click=reset">Reset</button>
```

When `userName` changes, the binding effect runs and updates the input.

The binding does not require the component to re-render its entire template. The runtime updates the bound DOM property directly through its reactive effect.

---

## `@bind` vs `@text`

`@bind` and `@text` solve different problems.

| | `@bind` | `@text` |
|--|---------|---------|
| Direction | Two-way | Context → DOM |
| Primary use | Form controls | Display text |
| User input | Writes to context | Not applicable |
| DOM property | `value` / `checked` | `textContent` |
| Writable destination | Required for user input | Not required |

Use:

```html
<span @text="userName"></span>
```

when displaying a value.

Use:

```html
<input @bind="userName" />
```

when the user should be able to edit that value.

---

## `@bind` vs `@on`

`@bind` provides the standard value synchronization for form controls.

Use `@on` when you need to respond to an event with application behavior:

```html
<input @bind="userName" />
<button @on="click=save">Save</button>
```

The two directives can be used together:

- `@bind` keeps the control synchronized with state.  
- `@on` handles additional application events.  

The binding's own `input` or `change` listener is managed independently by the runtime.

---

## Forms and Validation

`@bind` is responsible for synchronizing a control with component data.

It does not replace Udodi's form and validation system.

For form validation and submission, see:

- [Forms](../forms/README.md)  
- `@form`  
- `@validate`  
- `@submit`  

A form can use `@bind` for value synchronization while the form system handles validation and submission behavior.

---

## Lifecycle and Cleanup

The runtime registers cleanup callbacks for both sides of the binding:

- the reactive effect that synchronizes context → DOM  
- the event listener that synchronizes DOM → context  

When the component scope is disposed, the effect is stopped and the event listener is removed.

The `@bind` attribute itself is also removed from the DOM after the binding has been installed.

This means `@bind` is a runtime directive rather than an attribute that remains active in the final DOM.

---

## Behavior Summary

When Udodi encounters:

```html
<input @bind="user.name" />
```

the runtime performs the following:

1. Compiles the binding expression.  
2. Determines whether the expression represents a path.  
3. Creates a reactive effect for the context → DOM direction.  
4. Reads the current value.  
5. Applies that value to the appropriate DOM property.  
6. Registers the appropriate `input` / `change` listener.  
7. Writes user changes back to the bound path.  
8. Calls `touch()` after a nested-path mutation.  
9. Registers cleanup for the effect and event listener.  
10. Removes the `@bind` attribute after setup.  

---

## Syntax Summary

| Syntax | Behavior |
|--------|----------|
| `@bind="userName"` | Two-way binding to `userName` |
| `@bind="user.name"` | Two-way binding to a nested path |
| `@bind="settings.theme"` | Two-way binding to a nested path |
| `type="checkbox"` | Binds through `checked` as a boolean |
| `type="radio"` | Binds through `checked` and the radio's `value` |
| Other value controls | Binds through `value` |
| `null` / `undefined` on value controls | Applied as `""` |
| Nested path write | Performs the deep assignment and touches the root |
| Read-only destination | Write fails and warns once |

---

## Constraints

| Constraint | Behavior |
|------------|----------|
| Writable destination required | User input must resolve to a writable path |
| Nested paths supported | Deep writes are followed by root-level notification |
| Checkbox values | Always written as booleans |
| Radio values | Written only when the radio becomes selected |
| Value controls | Use the element's `value` |
| Reactive synchronization | Bound controls update when their dependencies change |
| Automatic cleanup | Effects and listeners are removed with the component scope |
| Runtime directive | `@bind` is removed after it is processed |

---

## Minimal Example

```js
import { createComponent, html, render } from "udodi";

const Form = createComponent({
  name: "Form",

  state() {
    return {
      userName: "",
      subscribed: false,
      plan: "pro",
    };
  },

  template: () => html`
    <form>
      <input @bind="userName" />

      <label>
        <input type="checkbox" @bind="subscribed" />
        Subscribe
      </label>

      <label>
        <input type="radio" name="plan" value="free" @bind="plan" />
        Free
      </label>

      <label>
        <input type="radio" name="plan" value="pro" @bind="plan" />
        Pro
      </label>

      <p @text="userName"></p>
    </form>
  `,
});

render(Form(), "#app");
```

---

## Next Steps

* [Template DSL](./dsl.md) — expression and path syntax  
* [`@text`](./text.md) — reactive text content  
* [`@on`](./on.md) — event handling  
* [`@class`](./class.md) — reactive classes  
* [`@style`](./style.md) — reactive inline styles  
* [Forms](../forms/README.md) — form state, validation, and submission  
* [Reactive State](../reactivity/state.md) — Udodi's reactive state model  
* [Template Overview](./overview.md) — how directives fit together  
