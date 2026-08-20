# Working with Fields

Fields are form controls that participate in Udodi's form system.

A control becomes a tracked field when it:

1. Declares `@validate`.
2. Is inside a `<form>` registered with `@form`.
3. Is registered after its parent form has been established.

The form controller tracks each field's value, interaction state, validation state, and initial value. Field errors are exposed through the controller's reactive `errors` object.

This guide covers:

* Field registration
* Field identity through the HTML `name` attribute
* Field state such as `touched`, `dirty`, and `validating`
* Radio and checkbox groups
* Reading and updating fields through the form controller
* The relationship between `@bind` and `@validate`
* Field registration and cleanup

---

## When a Control Becomes a Field

A control participates in the form system when it is a validated control inside a registered form:

```html
<form @form="login">
  <input
    name="email"
    @bind="email"
    @validate="required email"
  />
</form>
```

The control is registered as a field because:

* It has `@validate`.
* Its nearest enclosing form has `@form`.
* The parent form has already been registered.

Controls outside a registered form are not associated with a form controller.

Likewise, a control inside a native `<form>` without `@form` does not become a tracked field:

```html
<form>
  <input
    name="email"
    @validate="required email"
  />
</form>
```

The control may still participate in directive processing, but it does not receive form field state or appear in a form controller.

---

## Validation Does Not Run on Mount

Registering a field does not immediately execute its validators.

A newly registered field starts with:

* `touched: false`
* `dirty: false`
* `validating: false`

Validation begins when one of the field's configured triggers occurs.

See [Validation](./validation.md) for trigger behavior.

---

## The `name` Attribute

The HTML `name` attribute identifies a field within its form.

```html
<input
  name="email"
  @validate="required"
/>
```

The name is used by the form controller for:

* Validation errors
* `getField()`
* `getValue()`
* `setValue()`
* `resetField()`
* `setError()`
* `resetError()`

For example:

```js
ud.forms.login.errors.email;
ud.forms.login.getField("email");
ud.forms.login.getValue("email");
```

### Fields Without a Name

A validated control does not have to have a `name`, but it cannot participate fully in the controller's name-based API.

Without a name:

* The control can still be validated.
* No field-specific entry is created in `controller.errors`.
* Name-based controller methods cannot retrieve the field.

For form fields that need controller access or validation errors, use a stable name:

```html
<input
  name="email"
  @validate="required email"
/>
```

The same name can intentionally be shared by grouped controls such as radio buttons or checkbox sets.

---

## Field State

Each registered field maintains reactive state.

`controller.getField(name)` returns a normalized field state object:

```js
{
  element,
  name,
  type,
  value,
  touched,
  dirty,
  validating,
  initialValue,
}
```

### State Properties

| Property | Meaning |
| --- | --- |
| **`element`** | The underlying DOM control. |
| **`name`** | The control's HTML name. |
| **`type`** | The control's `element.type`. |
| **`value`** | The current normalized control value. |
| **`touched`** | Whether the control has received focus. |
| **`dirty`** | Whether the current value differs from the initial value. |
| **`validating`** | Whether validation for the field is currently in progress. |
| **`initialValue`** | The value captured when the field was registered. |

### Value Semantics

The field's value depends on the type of control.

| Control | `value` |
| --- | --- |
| Text-like controls | `element.value` |
| `<textarea>` | `element.value` |
| `<select>` | `element.value` |
| Checkbox | `element.checked` |
| Radio | `element.value` when checked; otherwise `null` |

`dirty` is determined by comparing the current field value with `initialValue`.

A field is dirty when:

```js
field.value !== field.initialValue
```

using strict equality.

---

## Touched and Dirty State

Field interaction state is updated automatically.

### Touched

A field becomes touched after its first `focus` event:

```js
field.touched === true
```

It remains touched until the field or form is reset.

### Dirty

Dirty state is recalculated when the control's value changes:

* Text-like controls use `input`.
* Checkboxes use `change`.
* Radio buttons use `change`.
* Select elements use `change`.

The form controller aggregates these field states:

```js
controller.touched
```

is `true` when any registered field is touched.

Likewise:

```js
controller.dirty
```

is `true` when any registered field is dirty.

---

## Grouped Fields

Multiple controls can intentionally share the same name. This is common for radio groups and checkbox groups:

```html
<input
  type="radio"
  name="plan"
  value="free"
  @validate="required"
/>

<input
  type="radio"
  name="plan"
  value="pro"
  @validate="required"
/>
```

Internally, the form keeps all fields with the same name together.

Controller methods therefore have group-aware behavior:

| Method | Group behavior |
| --- | --- |
| **`getField("plan")`** | Returns an array containing all fields with that name. A single field returns an object; no matching field returns `undefined`. |
| **`getValue("plan")`** | Returns the value represented by the first registered field in the group. |
| **`setValue("plan", value)`** | Applies the supplied value using the control's checkbox/radio semantics. |
| **`resetField("plan")`** | Resets every field in the group. |
| **`setError("plan", message)`** | Sets the shared `errors.plan` entry. |
| **`resetError("plan")`** | Clears the shared `errors.plan` entry. |

When the final field with a particular name is unregistered, its error entry is removed from the form controller.

---

## Reading Field State

### Through the Controller

The form controller provides the primary API for accessing field state:

```js
const field = ud.forms.login.getField("email");
const value = ud.forms.login.getValue("email");
```

The returned field object contains:

```js
{
  element,
  name,
  type,
  value,
  touched,
  dirty,
  validating,
  initialValue,
}
```

### In Templates

Reactive controller properties can be consumed directly in templates:

```html
<span @text="ud.forms.login.errors.email"></span>

<p @show="ud.forms.login.dirty">
  You have unsaved changes
</p>

<p @show="ud.forms.login.touched">
  Form has been interacted with
</p>

<p @show="ud.forms.login.validating">
  Checking…
</p>
```

For derived field state, use a component computed property rather than calling controller methods directly from the template.

For example:

```js
computed: {
  emailDirty() {
    return this.ud.forms.login.getField("email")?.dirty ?? false;
  },
},
```

The computed value can then be used declaratively:

```html
<span @show="emailDirty">
  Changed
</span>
```

This keeps template expressions declarative while allowing component logic to use controller methods such as `getField()` and `getValue()`.

---

## Updating Field Values

The form controller can update a field programmatically without bypassing the normal form state machinery.

### `setValue(name, value)`

```js
ud.forms.login.setValue(
  "email",
  "user@example.com"
);
```

The controller updates the appropriate DOM control and dispatches the corresponding event so that `@bind` and field state remain synchronized.

For example:

```js
ud.forms.login.setValue("plan", "pro");
```

can update a radio or checkbox group according to its control semantics.

The behavior depends on the control type:

* **Checkbox** — accepts a boolean, a matching value, or an array of values for checkbox groups.
* **Radio** — selects the control whose value matches.
* **Other controls** — assigns the supplied value to `element.value`.
* `null` and `undefined` become an empty string for value-based controls.

`setValue()` returns:

* `true` when at least one field was updated.
* `false` when no matching field was found or no field could be updated.

### Resetting a Field

Use `resetField()` to reset one field or an entire group:

```js
ud.forms.login.resetField("email");

ud.forms.login.resetField("email", {
  clearField: false,
});
```

The `clearField` option controls how the DOM value is handled:

| Option | Default | Effect |
| --- | --- | --- |
| **`clearField`** | `true` | Clears the control to its empty state. |
| **`clearField: false`** | — | Keeps the current value and uses it as the new `initialValue`. |

Resetting a field also:

* Clears `touched`.
* Clears `dirty`.
* Clears `validating`.
* Clears the field's validation error.
* Recalculates form-level `touched` and `dirty` state.

The method returns `true` when the field exists and `false` otherwise.

---

## Managing Field Errors

Errors can be managed directly through the form controller:

```js
ud.forms.login.setError(
  "email",
  "Server rejected this address"
);

ud.forms.login.resetError("email");
```

These operations update `controller.errors` and therefore affect the form's reactive `valid` state.

They do not execute validators.

This is useful when a server returns an error after a successful client-side validation pass:

```js
controller.setError(
  "email",
  "This email address is already registered"
);
```

The error can then be displayed declaratively:

```html
<span @text="ud.forms.login.errors.email"></span>
```

See [Form Controllers](./controllers.md) for the complete error API.

---

## Relationship to `@bind`

`@validate` does not own a field's value.

In the common case, component state owns the value and `@bind` synchronizes that state with the DOM:

```html
<input
  name="email"
  @bind="email"
  @validate="required email"
/>
```

The responsibilities are therefore separate:

| Feature | Responsibility |
| --- | --- |
| **`@bind`** | Synchronizes component state and the DOM value. |
| **`@validate`** | Validates the current control value and manages validation state. |
| **`setValue()`** | Programmatically changes the DOM value while dispatching the appropriate event. |
| **`resetField()`** | Resets field state and its value according to the reset options. |

When validation runs, the validator receives the control's current value.

A control can therefore use `@validate` without `@bind`:

```html
<input
  name="email"
  @validate="required email"
/>
```

In that case, the application can rely on the form's `FormData` during submission or access the field through the controller.

---

## Field Lifecycle

A field follows the lifecycle of its associated DOM control:

| Lifecycle event | Effect |
| --- | --- |
| **Field registered** | Captures `initialValue`, initializes its error entry, and adds the field to the form registry. |
| **Focus** | Sets `touched` to `true`. |
| **Input / change** | Recalculates `dirty` and updates aggregate form state. |
| **Validation starts** | Sets field and form `validating` state. |
| **Validation ends** | Clears field `validating`; the form clears its aggregate state when no validations remain; the field error is updated. |
| **Field unregistered** | Removes the field from the registries. If it was the final field with that name, its error entry is removed. |
| **`controller.reset()`** | Resets all fields, clears interaction and validation state, refreshes initial values, and clears errors. |

If a field is removed while asynchronous validation is still running, the associated validation is cancelled during cleanup.

---

## Example: Field State in the UI

The following example exposes derived field state through a computed property while keeping the template declarative:

```js
import { createComponent, html, render } from "udodi";

const ProfileForm = createComponent({
  name: "ProfileForm",

  state() {
    return {
      displayName: "",
    };
  },

  computed: {
    displayNameDirty() {
      return this.ud.forms.profile
        .getField("displayName")?.dirty ?? false;
    },
  },

  methods: {
    required(value) {
      return value?.trim()
        ? true
        : "Required";
    },

    resetDisplayName() {
      this.ud.forms.profile.resetField("displayName");
    },
  },

  template: html`
    <form @form="profile">
      <label>
        Display name
        <input
          name="displayName"
          @bind="displayName"
          @validate="required"
          @trigger="lazy"
        />
      </label>

      <p @show="displayNameDirty">
        You changed this field
      </p>

      <p @text="ud.forms.profile.errors.displayName"></p>

      <button
        type="button"
        @on="click=resetDisplayName"
      >
        Reset field
      </button>
    </form>
  `,
});

render(ProfileForm(), "#app");
```

Here the field's value is owned by component state through `@bind`, while the form system independently tracks:

* Whether the field has been touched.
* Whether its value has changed.
* Whether validation is running.
* Whether validation produced an error.

The `displayNameDirty` computed property derives the field's dirty state from the form controller so the template does not directly invoke `getField()`.

---

## Next Steps

| Goal | Guide |
| --- | --- |
| Write validators and configure `@trigger` | [Validation](./validation.md) |
| Understand sequential and parallel validation | [Sequential and Parallel Validation](./sequential-parallel.md) |
| Handle submit handlers and the submission lifecycle | [Form Submission](./submission.md) |
| Use the complete controller API | [Form Controllers](./controllers.md) |
| Build asynchronous validators and handle cancellation | [Async Validation](./async.md) |

For form registration and validation modes, see [Creating a Form](./creating.md).

For the high-level architecture of the entire form system, see [Forms Overview](./overview.md).
