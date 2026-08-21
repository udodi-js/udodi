# Form Controllers

When a form declares `@form`, Udodi creates a **reactive form controller** under `ud.forms.<name>`.

The controller is the public API for:

- form validation and interaction state
- field errors
- field values and state
- programmatic field updates
- resetting forms and fields
- server-side errors
- submit state
- validation mode

---

## Accessing the Controller

A form registered as:

```html
<form @form="login">
  ...
</form>
```

creates a controller at:

```js
ud.forms.login
```

The controller is available through the component's public `ud` context.

### In templates

Controller state can be consumed directly when it is already a reactive property:

```html
<span @text="ud.forms.login.errors.email"></span>

<button @attr="disabled=ud.forms.login.submitting=>'disabled'">
  Sign in
</button>
```

### In methods

```js
methods: {
  clear() {
    this.ud.forms.login.reset();
  },
}
```

### In computed values

Computed values are the preferred way to derive reusable UI state from controller or field state:

```js
computed: {
  canSubmit() {
    const form = this.ud.forms.login;

    if (form.valid && !form.submitting) {
      return undefined; // this clear the "disabled" attribute
    }

    return "disabled"; // disable the submit button
  },
},
```

Then use the computed value in the template:

```html
<button @attr="disabled=canSubmit">
  Sign in
</button>
```

For field-specific derived state, use a computed value rather than calling `getField()` directly from a directive expression which is invalid:

```js
computed: {
  emailDirty() {
    return this.ud.forms.login.getField("email")?.dirty ?? false;
  },
},
```

```html
<span @show="emailDirty">
  Changed
</span>
```

This keeps field-state lookup and derived logic in the component's reactive layer.

### In submit handlers

A submit handler receives the same controller instance through its submit context:

```js
methods: {
  async login({ formData, controller }) {
    // controller === this.ud.forms.login

    await api.login(Object.fromEntries(formData));

    controller.reset();
  },
}
```

---

## Controller Shape

A controller exposes reactive status properties, a reactive error map, and imperative field/form methods:

```js
{
  // Reactive status
  valid: true,
  validating: false,
  dirty: false,
  touched: false,
  submitting: false,
  submitted: false,

  // Read-only validation strategy
  validationMode: "sequential",

  // Reactive field errors
  errors: {
    email: "",
    password: "",
  },

  // Form operations
  reset(options?),

  // Field operations
  resetField(name, options?),
  getField(name),
  getValue(name),
  setValue(name, value),

  // Error operations
  setError(name, message),
  resetError(name),
}
```

The exact initial contents of `errors` depend on which named fields have registered `@validate`.

`validationMode` is a read-only property reflecting the mode declared by `@form`:

```html
<form @form="login parallel">
```

```js
ud.forms.login.validationMode;
// "parallel"
```

The available modes are:

- `"sequential"` — the default
- `"parallel"`

See [Sequential and Parallel Validation](./sequential-parallel.md).

---

## Status Properties

The controller exposes aggregate form state:

| Property | Type | Meaning |
| --- | --- | --- |
| **`valid`** | `boolean` | `true` only when every entry in `errors` is an empty string |
| **`validating`** | `boolean` | `true` while one or more field validations are in progress |
| **`dirty`** | `boolean` | `true` when at least one registered field is dirty |
| **`touched`** | `boolean` | `true` when at least one registered field has been focused |
| **`submitting`** | `boolean` | `true` while the `@submit` pipeline is active |
| **`submitted`** | `boolean` | `true` after successful validation and handler completion, unless `reset()` was called |
| **`validationMode`** | `"sequential" \| "parallel"` | Form-level strategy used for full-form validation |

### `valid`

`valid` is derived entirely from the controller's `errors` object.

A form is valid when every registered error is an empty string:

```js
ud.forms.login.valid
```

Setting an error makes the form invalid:

```js
ud.forms.login.setError(
  "email",
  "This email is already registered"
);
```

Clearing it restores validity when no other errors remain:

```js
ud.forms.login.resetError("email");
```

### `validating`

`validating` is `true` while one or more registered fields are being validated.

This includes asynchronous validators:

```html
<p @show="ud.forms.login.validating">
  Checking...
</p>
```

The form remains validating until all currently active field validation cycles have settled.

### `dirty`

`dirty` is an aggregate of registered field state.

It becomes `true` when any registered field's current value differs from its `initialValue`.

```html
<p @show="ud.forms.login.dirty">
  You have unsaved changes.
</p>
```

See [Working with Fields](./fields.md) for field-level dirty semantics.

### `touched`

`touched` is an aggregate of registered field state.

It becomes `true` when any registered field has received focus.

```html
<p @show="ud.forms.login.touched">
  Form has been interacted with.
</p>
```

### `submitting`

`submitting` tracks the `@submit` lifecycle:

```html
<button
  type="submit"
  @attr="disabled=ud.forms.login.submitting=>'disabled'"
>
  Save
</button>
```

It becomes `true` when submission begins and remains `true` while validation and the submit handler are active.

See [Form Submission](./submission.md).

### `submitted`

`submitted` becomes `true` after:

- form validation succeeds, and
- the submit handler completes successfully.

If the submit handler calls:

```js
controller.reset();
```

the reset state is preserved and the submission lifecycle does not force `submitted` back to `true`.

This allows a successful submission to leave the form clean without producing an unwanted `submitted`-state transition.

### `validationMode`

`validationMode` exposes the form's full-validation strategy:

```js
ud.forms.login.validationMode
```

It is read-only.

The value comes from `@form`:

```html
<form @form="login">
  <!-- sequential -->
</form>

<form @form="signup sequential">
  <!-- sequential -->
</form>

<form @form="checkout parallel">
  <!-- parallel -->
</form>
```

The mode affects how different fields are coordinated during full-form validation.

It does not change the order of validators declared on a single field.

See [Sequential and Parallel Validation](./sequential-parallel.md).

---

## `errors`

`errors` is the controller's reactive map of field names to validation messages:

```js
ud.forms.login.errors.email
// "" or "This field is required"

ud.forms.login.errors.password
// "" or "At least 8 characters"
```

A named field using `@validate` creates its error entry when it registers:

```html
<input
  name="email"
  @validate="required email"
/>
```

The corresponding controller state becomes:

```js
ud.forms.login.errors.email
```

with an initial value of:

```js
""
```

### Error semantics

- `""` means the field currently has no error.
- A non-empty string represents the field's current error.
- Validators update the error automatically.
- `setError()` allows application code to set an error manually.
- `resetError()` clears an error without running validators.
- Removing the last registered field for a name removes that error entry.

Because `valid` is derived from `errors`, changing an error also updates form validity.

### Displaying errors

Direct controller properties can be consumed directly:

```html
<span @text="ud.forms.login.errors.email"></span>
```

For derived error state or more complex presentation logic, use a computed value.

---

## Methods

### `reset(options?)`

Resets the entire form.

```js
controller.reset();
```

By default, the native form is also reset:

```js
controller.reset({
  clearForm: true,
});
```

To reset controller state without calling the native `form.reset()`:

```js
controller.reset({
  clearForm: false,
});
```

#### Options

| Option | Default | Effect |
| --- | --- | --- |
| **`clearForm`** | `true` | Calls the native `form.reset()` when available |

#### Controller state after reset

`reset()`:

- sets `valid` to `true`
- sets `dirty` to `false`
- sets `touched` to `false`
- sets `validating` to `false`
- sets `submitting` to `false`
- sets `submitted` to `false`
- clears every registered error
- clears field `touched` state
- clears field `dirty` state
- clears field `validating` state
- refreshes each field's `initialValue` from its current DOM value

Example:

```js
controller.reset();
```

After the reset:

```js
controller.valid === true;
controller.dirty === false;
controller.touched === false;
controller.submitting === false;
controller.submitted === false;
controller.validating === false;
```

#### Reset and submission

`reset()` also records that the form was explicitly reset during the current submission lifecycle.

Therefore, if a submit handler does:

```js
async save({ controller }) {
  await saveData();

  controller.reset();
}
```

the submit lifecycle does not subsequently force:

```js
controller.submitted = true;
```

This is useful when a successful submission should immediately leave the form in its clean initial state.

See [Form Submission](./submission.md).

---

### `resetField(name, options?)`

Resets one field or all controls belonging to a field group.

```js
controller.resetField("email");
```

For grouped controls such as radios or checkboxes sharing a name, every registered control in the group is reset.

```js
controller.resetField("plan");
```

#### Options

```js
controller.resetField("email", {
  clearField: false,
});
```

| Option | Default | Effect |
| --- | --- | --- |
| **`clearField`** | `true` | Clears the control. If `false`, keeps the current DOM value and uses it as the new `initialValue` |

With the default:

```js
controller.resetField("email");
```

the control is cleared and its interaction state is reset.

With:

```js
controller.resetField("email", {
  clearField: false,
});
```

the current DOM value is retained and becomes the field's new baseline.

#### Effects

`resetField()`:

- clears `touched`
- clears `dirty`
- clears `validating`
- clears the field's error
- recalculates form-level `touched`
- recalculates form-level `dirty`

#### Return value

Returns `true` when the field exists.

Returns `false` when no registered field matches the supplied name.

---

### `getField(name)`

Returns the normalized state of a registered field.

```js
const field = controller.getField("email");
```

The returned field state has the following shape:

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

#### Result

| Result | Meaning |
| --- | --- |
| **Object** | Exactly one registered control has the name |
| **Array** | Multiple registered controls share the name |
| **`undefined`** | No registered field has the name |

For example:

```js
const email = controller.getField("email");

console.log(email.value);
console.log(email.dirty);
console.log(email.touched);
```

#### Field groups

For a radio or checkbox group:

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

`getField("plan")` returns an array:

```js
[
  {
    element,
    name: "plan",
    type: "radio",
    value: "free",
    touched,
    dirty,
    validating,
    initialValue,
  },
  {
    element,
    name: "plan",
    type: "radio",
    value: "pro",
    touched,
    dirty,
    validating,
    initialValue,
  },
]
```

#### Template usage

`getField()` is an imperative lookup API.

When field state needs to participate in reactive template rendering, prefer exposing the derived state through a computed value:

```js
computed: {
  emailDirty() {
    return this.ud.forms.login.getField("email")?.dirty ?? false;
  },
},
```

Then:

```html
<span @show="emailDirty">
  Changed
</span>
```

Trying to use `getField()` in a directive expression result to invalid directive DSL.

---

### `getValue(name)`

Returns the current value of a registered field.

```js
const email = controller.getValue("email");
```

If no field with that name exists, `undefined` is returned.

Value semantics follow the field type.

| Control | Value |
| --- | --- |
| Text-like controls | `element.value` |
| `textarea` | `element.value` |
| `select` | `element.value` |
| Checkbox | `element.checked` |
| Radio | `element.value` when checked, otherwise `null` |

For a group of controls sharing a name, `getValue()` returns the value of the first registered control.

For example:

```js
const plan = controller.getValue("plan");
```

---

### `setValue(name, value)`

Programmatically updates the value of one or more registered controls.

```js
controller.setValue(
  "email",
  "user@example.com"
);
```

The controller writes to the DOM and dispatches the appropriate `input` or `change` event so that related `@bind` state and dirty tracking remain synchronized.

#### Control behavior

| Control | Accepted behavior |
| --- | --- |
| **Checkbox** | Boolean, matching value string, or array of values for a group |
| **Radio** | Checks the control whose value matches |
| **Other controls** | Sets `element.value`; `null` / `undefined` become `""` |

Examples:

```js
controller.setValue("email", "user@example.com");

controller.setValue("newsletter", true);

controller.setValue("plan", "pro");
```

For a checkbox group:

```js
controller.setValue("features", [
  "analytics",
  "reports",
]);
```

The corresponding DOM events are dispatched so that `@bind` can observe the programmatic change.

Form-level `dirty` and `touched` state are recalculated afterward.

#### Return value

Returns `true` if at least one registered field was updated.

Otherwise `false`.

---

### `setError(name, message)`

Sets a field error manually without running its validators.

```js
controller.setError(
  "email",
  "This email is already registered"
);
```

This is particularly useful for server-side validation:

```js
async save({ formData, controller }) {
  const response = await api.save(
    Object.fromEntries(formData)
  );

  if (!response.ok) {
    controller.setError(
      "email",
      response.message
    );

    return;
  }

  controller.reset();
}
```

#### Behavior

`setError()`:

- trims string messages
- converts non-string messages to an empty string
- updates `errors[name]`
- recalculates `valid`
- does not run validators

If the supplied message is identical to the current error, the operation is a no-op.

An empty field name is also ignored.

#### Return value

Returns `true` if the error changed.

Returns `false` if nothing changed.

---

### `resetError(name)`

Clears a field error without running validators.

```js
controller.resetError("email");
```

The resulting error is:

```js
controller.errors.email === "";
```

`resetError()`:

- clears the error
- recalculates `valid`
- does not execute validators

If the field name does not exist in `errors`, or the error is already empty, nothing changes.

#### Return value

Returns `true` if the error changed.

Otherwise `false`.

---

## Field Groups

A controller supports multiple controls sharing the same HTML name.

This is common for:

- radio groups
- checkbox groups

For example:

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

The controller maintains the individual registered fields while exposing name-based helpers.

| Method | Group behavior |
| --- | --- |
| **`getField(name)`** | Returns an array of field states |
| **`getValue(name)`** | Returns the first registered control's value |
| **`setValue(name, value)`** | Applies the value according to control type |
| **`resetField(name)`** | Resets every control in the group |
| **`setError(name, message)`** | Uses one shared `errors[name]` entry |
| **`resetError(name)`** | Clears the shared `errors[name]` entry |

When the final registered control for a name is removed, the corresponding `errors[name]` entry is removed as well.

See [Working with Fields](./fields.md) for complete group semantics.

---

## Reactivity

Controller status and error state are reactive.

Components can react to changes caused by:

- validation
- field interaction
- asynchronous validation
- programmatic value updates
- error updates
- form submission
- form resets

For example:

```html
<p @show="ud.forms.login.dirty">
  You have unsaved changes.
</p>

<p @show="ud.forms.login.validating">
  Checking...
</p>

<p @show="ud.forms.login.submitting">
  Signing in...
</p>

<span @text="ud.forms.login.errors.email"></span>
```

Computed values can derive higher-level application state:

```js
computed: {
  canSubmit() {
    const form = this.ud.forms.login;

    if (form.valid && !form.submitting) {
      return undefined;
    }

    return "disabled";
  },
},
```

```html
<button
  type="submit"
  @attr="disabled=canSubmit"
>
  Sign in
</button>
```

The controller therefore acts as the reactive boundary between the form runtime and application UI.

---

## Server-Side Errors

Client-side validation cannot guarantee that a submission will be accepted by the server.

After a successful client validation pass, the submit handler can map server failures into controller errors:

```js
methods: {
  async save({ formData, controller }) {
    const response = await api.save(
      Object.fromEntries(formData)
    );

    if (!response.ok) {
      controller.setError(
        "email",
        response.message || "Unable to save"
      );

      return;
    }

    controller.reset();
  },
},
```

The error immediately becomes part of the reactive `errors` object:

```js
controller.errors.email
```

and therefore affects:

```js
controller.valid
```

No validator needs to be executed again.

This makes `setError()` appropriate for errors originating outside the client-side validation system, such as:

- duplicate email addresses
- authorization failures
- business-rule violations
- server-side validation
- optimistic submission failures

---

## Controller Lifecycle

The controller is created and destroyed with the form's runtime registration.

| Event | Controller effect |
| --- | --- |
| `@form` registers | Controller is created under `ud.forms.<name>` |
| Named validated field registers | `errors[name]` is initialized to `""` when needed |
| Field receives focus | Aggregate `touched` state may become `true` |
| Field changes | Aggregate `dirty` state is recalculated |
| Validation starts | `validating` becomes active |
| Validation finishes | Errors and `validating` state are updated |
| Field unregisters | Its field state is removed |
| Last field with a name unregisters | `errors[name]` is removed |
| Form/component cleanup | Controller is removed from `ud.forms` |

Application code does not need to manually unregister the controller.

---

## Example

The following example uses the controller for derived submit state, server-side errors, field reset, and form reset:

```js
import { createComponent, html, render } from "udodi";

const AccountForm = createComponent({
  name: "AccountForm",

  state() {
    return {
      email: "",
    };
  },

  computed: {
    canSubmit() {
      const form = this.ud.forms.login;

      if (form.valid && !form.submitting) {
        return undefined;
      }

      return "disabled";
    },

    emailDirty() {
      return this.ud.forms.account.getField("email")?.dirty ?? false;
    },
  },

  methods: {
    required(value) {
      return value?.trim() ? true : "Required";
    },

    email(value) {
      if (!value) return true;

      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? true
        : "Invalid email";
    },

    async save({ formData, controller }) {
      const response = await api.save(
        Object.fromEntries(formData)
      );

      if (!response.ok) {
        controller.setError(
          "email",
          response.message || "Unable to save"
        );

        return;
      }

      controller.reset();
    },

    clearEmail() {
      this.ud.forms.account.resetField("email");
    },

    clearForm() {
      this.ud.forms.account.reset();
    },
  },

  template: html`
    <form
      @form="account"
      @submit="save"
    >
      <label>
        Email
        <input
          name="email"
          type="email"
          @bind="email"
          @validate="required email"
        />
      </label>

      <span @text="ud.forms.account.errors.email"></span>

      <p @show="emailDirty">
        You changed this field.
      </p>

      <p @show="ud.forms.account.validating">
        Validating...
      </p>

      <p @show="ud.forms.account.submitting">
        Saving...
      </p>

      <button
        type="submit"
        @attr="disabled=canSubmit"
      >
        Save
      </button>

      <button
        type="button"
        @on="click=clearEmail"
      >
        Reset email
      </button>

      <button
        type="button"
        @on="click=clearForm"
      >
        Reset form
      </button>
    </form>
  `,
});

render(AccountForm(), "#app");
```

---

## Common Patterns

### Disable submission while invalid or submitting

```js
computed: {
  canSubmit() {
    const form = this.ud.forms.login;

    if (form.valid && !form.submitting) {
      return undefined;
    }

    return "disabled";
  },
},
```

```html
<button
  type="submit"
  @attr="disabled=canSubmit"
>
  Sign in
</button>
```

### Show an individual error

```html
<span @text="ud.forms.login.errors.email"></span>
```

### Show aggregate form state

```html
<p @show="ud.forms.login.dirty">
  Unsaved changes
</p>

<p @show="ud.forms.login.touched">
  Form has been touched
</p>

<p @show="ud.forms.login.validating">
  Validating...
</p>

<p @show="ud.forms.login.submitting">
  Submitting...
</p>
```

### Set a server error

```js
controller.setError(
  "email",
  "That email is already registered"
);
```

### Clear a server error

```js
controller.resetError("email");
```

### Reset a single field

```js
controller.resetField("email");
```

### Reset the entire form

```js
controller.reset();
```

### Update a field programmatically

```js
controller.setValue(
  "email",
  "user@example.com"
);
```

---

## API Summary

| API | Purpose |
| --- | --- |
| **`valid`** | Aggregate validation state |
| **`validating`** | Tracks active validation |
| **`dirty`** | Aggregate field dirty state |
| **`touched`** | Aggregate field touched state |
| **`submitting`** | Tracks the submit pipeline |
| **`submitted`** | Tracks successful submission |
| **`validationMode`** | `"sequential"` or `"parallel"` |
| **`errors`** | Map reactive field-name to error map |
| **`reset()`** | Reset the entire form |
| **`resetField(name)`** | Reset one field or field group |
| **`getField(name)`** | Read normalized field state |
| **`getValue(name)`** | Read a field's current value |
| **`setValue(name, value)`** | Programmatically update field value |
| **`setError(name, message)`** | Set a manual/server error |
| **`resetError(name)`** | Clear a manual/server error |

---

## Next Steps

| Goal | Guide |
| --- | --- |
| Register a form and choose its validation mode | [Creating a Form](./creating.md) |
| Understand field state and field groups | [Working with Fields](./fields.md) |
| Define validators and validation triggers | [Validation](./validation.md) |
| Handle form submission | [Form Submission](./submission.md) |
| Choose sequential or parallel validation | [Sequential and Parallel Validation](./sequential-parallel.md) |
| Handle asynchronous validators and cancellation | [Async Validation](./async.md) |

For the higher-level form architecture, see [Forms Overview](./overview.md).
