# Creating a Form

A form in Udodi is a native `<form>` element that declares the `@form` directive.

`@form` registers the form with the runtime, creates its reactive **form controller**, and establishes the internal form scope used by `@validate` and `@submit`.

This guide covers:

* Registering a form
* Choosing sequential or parallel validation
* Accessing the form controller
* Creating multiple forms in one component
* Understanding registration and cleanup
* Avoiding common registration mistakes

For validation, field state, and submission behavior, see the specialized guides linked at the end of this document.

---

## Basic Registration

Register a form by adding `@form` to a native `<form>` element:

```html
<form @form="login">
  <!-- fields -->
</form>
```

The identifier `login` becomes the form's key.

The runtime creates a reactive controller at:

```js
ud.forms.login
```

and registers the form internally so that fields using `@validate` and the form using `@submit` can participate in the same form lifecycle.

If `ud.forms` does not already exist, Udodi creates it when the first form is registered.

### Registration Rules

`@form` has a deliberately small syntax:

```html
<form @form="formName">
```

The following rules apply:

* `@form` may only be used on a native `<form>` element.
* The form identifier must be a single unquoted token.
* Form identifiers must be unique within a component.
* The optional second token specifies the validation mode.
* Only `sequential` and `parallel` are valid validation modes.

For example:

```html
<!-- Valid -->
<form @form="login">
  ...
</form>

<!-- Invalid: @form is not on a <form> -->
<div @form="login">
  ...
</div>

<!-- Invalid: the identifier must not be a string literal -->
<form @form="'login'">
  ...
</form>
```

Invalid registrations produce a runtime warning and are not registered.

---

## Validation Mode

The optional second token selects how form-level validation is executed.

```html
<!-- Sequential (default) -->
<form @form="login">

<!-- Explicit sequential -->
<form @form="login sequential">

<!-- Parallel -->
<form @form="login parallel">
```

| Mode             | Behavior                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`sequential`** | Validators execute one after another and stop at the first failure. During submission, the first invalid field receives focus.                                                                   |
| **`parallel`**   | Field validations execute concurrently. The form waits for all validations to settle before determining validity. During submission, the first invalid field receives focus if validation fails. |

If no mode is specified, `sequential` is used.

An unknown mode causes a warning and prevents the form from being registered:

```html
<!-- Invalid -->
<form @form="login concurrent">
```

Validation mode primarily determines **how validation work is executed**. Field-level validation triggers determine **when individual validation starts**.

For the complete execution semantics, see **[Sequential and Parallel Validation](./sequential-parallel.md)**.

---

## Accessing the Form Controller

Once registered, the form controller is available through `ud.forms`:

```html
<form @form="login">
  <span @text="ud.forms.login.valid"></span>
</form>
```

The same controller can be accessed from component methods through the component's public context:

```js
methods: {
  logStatus() {
    console.log(this.ud.forms.login.valid);
  },
}
```

The controller provides reactive form state and programmatic operations:

```js
ud.forms.login = {
  valid: true,
  validating: false,
  dirty: false,
  touched: false,
  submitting: false,
  submitted: false,

  validationMode: "sequential",

  errors: {},

  reset(options?),
  getField(name),
  getValue(name),
  setValue(name, value),
  resetField(name, options?),
  setError(name, message),
  resetError(name),
};
```

The controller's detailed API is documented separately in **[Form Controllers](./controllers.md)**.

---

## Form State

A newly registered form starts with no validation errors and therefore has a valid state:

```js
ud.forms.login.valid === true
```

As validated fields register with the form, their errors are tracked by field name:

```js
ud.forms.login.errors
```

For example:

```js
{
  email: "",
  password: "At least 8 characters"
}
```

The main aggregate properties are:

* **`valid`** — `true` when every registered error is an empty string.
* **`validating`** — `true` while field validation is in progress, including asynchronous validation.
* **`dirty`** — aggregate dirty state derived from registered fields.
* **`touched`** — aggregate touched state derived from registered fields.
* **`submitting`** — indicates that the submit handler is currently executing.
* **`submitted`** — tracks successful form submission.
* **`validationMode`** — the form's validation execution strategy.
* **`errors`** — the reactive map of field names to validation error messages.

A field contributes an entry to `errors` when it has both a `name` and `@validate`.

Consequently, immediately after form registration, it is normal for:

```js
ud.forms.login.errors
```

to be empty.

---

## Minimal Example

The following example registers a form with parallel validation, binds its fields to component state, attaches validators, and handles submission.

```js
import { createComponent, html, render } from "udodi";

const SignupForm = createComponent({
  name: "SignupForm",

  state() {
    return {
      email: "",
      password: "",
    };
  },

  methods: {
    required(value) {
      return value?.trim()
        ? true
        : "Required";
    },

    email(value) {
      if (!value) return true;

      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? true
        : "Enter a valid email";
    },

    min(value, limit) {
      return !value || value.length >= Number(limit)
        ? true
        : `At least ${limit} characters`;
    },

    async signup({ formData, controller }) {
      // Submit formData to an API...

      controller.reset();
    },
  },

  template: html`
    <form @form="signup parallel" @submit="signup">
      <label>
        Email

        <input
          name="email"
          type="email"
          @bind="email"
          @validate="required email"
        />

        <span @text="ud.forms.signup.errors.email"></span>
      </label>

      <label>
        Password

        <input
          name="password"
          type="password"
          @bind="password"
          @validate="required min:8"
        />

        <span @text="ud.forms.signup.errors.password"></span>
      </label>

      <button
        type="submit"
        @attr="disabled=ud.forms.signup.submitting=>'disabled'"
      >
        Create account
      </button>
    </form>
  `,
});

render(SignupForm(), "#app");
```

Here:

* `@form="signup parallel"` registers the form under `ud.forms.signup` and selects parallel validation.
* `@submit="signup"` connects submission to the component's `signup` method.
* `name` identifies each field within the form.
* `@validate` attaches validators to each field.
* `ud.forms.signup.errors` exposes reactive validation errors.
* `ud.forms.signup.submitting` exposes the submission state.

---

## Multiple Forms in One Component

A component can contain multiple forms as long as their identifiers are unique:

```html
<form @form="login">
  ...
</form>

<form @form="invite parallel">
  ...
</form>
```

They are exposed independently:

```js
ud.forms.login;
ud.forms.invite;
```

In this example:

* `login` uses sequential validation by default.
* `invite` uses parallel validation.

Each form has its own controller, field registry, validation mode, errors, and lifecycle.

Fields and submission handlers are associated with their **nearest enclosing registered form**. This allows multiple independent forms to coexist within the same component.

Duplicate form identifiers are not allowed:

```html
<form @form="login">
  ...
</form>

<form @form="login">
  ...
</form>
```

The second registration is skipped and the runtime emits a warning.

---

## Form and Submission Registration

`@submit` is associated with the form declared by `@form`.

A valid submission setup therefore looks like:

```html
<form @form="login" @submit="login">
  ...
</form>
```

A form without `@form` cannot establish the form controller required by the submission system:

```html
<!-- Invalid -->
<form @submit="login">
  ...
</form>
```

The runtime warns and does not bind the submission handler.

For submission handler arguments, validation before submission, and the submission lifecycle, see **[Form Submission](./submission.md)**.

---

## Cleanup

Form registration follows the component's lifecycle.

When the component unmounts, or the form's effect scope is cleaned up, Udodi automatically:

* Removes the form controller from `ud.forms`.
* Removes the internal form registry used by validation and submission.
* Cleans up the associated reactive form state.

Forms therefore do not require manual unregistration.

---

## Common Mistakes

| Mistake                                         | Result                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `@form` on a non-`<form>` element               | Warning; the form is not registered.                                                                      |
| Quoted identifier such as `@form="'login'"`     | Warning; the form is not registered.                                                                      |
| Duplicate form key within a component           | Warning; the duplicate registration is skipped.                                                           |
| Unknown mode such as `@form="login concurrent"` | Warning; the form is not registered.                                                                      |
| `@submit` without `@form` on the same `<form>`  | Warning; submission is not bound.                                                                         |
| Validated field without `name`                  | The field can validate, but its validation error cannot be keyed under `controller.errors` by field name. |

---

## Next Steps

| Goal                                          | Guide                                                              |
| --------------------------------------------- | ------------------------------------------------------------------ |
| Understand field registration and field state | **[Working with Fields](./fields.md)**                             |
| Write validators and configure `@trigger`     | **[Validation](./validation.md)**                                  |
| Understand sequential and parallel validation | **[Sequential and Parallel Validation](./sequential-parallel.md)** |
| Handle form submission                        | **[Form Submission](./submission.md)**                             |
| Use the complete controller API               | **[Form Controllers](./controllers.md)**                           |

For a higher-level picture of how `@form`, `@validate`, and `@submit` interact, see [Forms Overview](./overview.md).
