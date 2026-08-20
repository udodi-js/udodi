# Forms Overview

Udodi provides a reactive form system for managing **form state, field state, validation, and submission** directly in the runtime.

A form is built around a reactive **form controller**. Fields register themselves with that form, validators determine whether their values are valid, and `@submit` coordinates validation and submission.

The system supports synchronous and asynchronous validation, configurable validation triggers, sequential or parallel execution, reactive errors and status, and cancellation of superseded asynchronous validation.

No separate form library is required.

---

## How the Pieces Fit Together

A typical form combines four form directives:

| Directive       | Role                                                                                 |
| --------------- | ------------------------------------------------------------------------------------ |
| **`@form`**     | Registers a reactive form controller and establishes the form's validation scope.    |
| **`@validate`** | Attaches one or more validators to a form control.                                   |
| **`@trigger`**  | Controls when a field's validators run.                                              |
| **`@submit`**   | Coordinates form validation and invokes the submit handler when validation succeeds. |

For example:

```html
<form @form="login" @submit="login">
  <input
    name="email"
    @bind="email"
    @validate="required email"
  />

  <input
    name="password"
    @bind="password"
    @validate="required min:8"
  />

  <button type="submit">
    Sign in
  </button>
</form>
```

The runtime coordinates these directives as a single form lifecycle:

1. **`@form="login"`** creates a reactive controller at `ud.forms.login` and establishes the internal form registry used to associate fields, validators, and submission with the form.
2. **`@validate="..."`** registers validators for each control. The validators run according to the field's configured trigger.
3. **`@trigger="..."`** determines when those validators execute: during live input/change, on blur, or during form submission.
4. **`@submit="login"`** validates the registered fields according to the form's validation mode. If validation succeeds, the component's `login` method is invoked.

Field values are normally managed through component state and `@bind`. Validation state is maintained by the form controller and exposed reactively through `ud.forms`.

---

## The Form Controller

Declaring a form with `@form` creates a reactive form controller:

```html
<form @form="login">
```

The controller is available at:

```js
ud.forms.login
```

A form controller provides aggregate state, validation errors, and programmatic form and field operations:

```js
{
  valid: true,
  validating: false,
  dirty: false,
  touched: false,
  submitting: false,
  submitted: false,

  validationMode: "sequential",

  errors: {
    // field name -> error message
  },

  reset(options?),
  getField(name),
  getValue(name),
  setValue(name, value),
  resetField(name, options?),
  setError(name, message),
  resetError(name),
}
```

The important distinction is that the controller is the **form-level reactive state surface**. Individual fields maintain their own state, while the controller aggregates information such as validity, interaction state, validation activity, and submission state.

### Form State

* **`valid`** — `true` when every entry in `errors` is an empty string.
* **`validating`** — `true` while form field validation is in progress, including asynchronous validation.
* **`dirty`** — indicates that the form has field-level changes.
* **`touched`** — indicates that fields in the form have been interacted with.
* **`submitting`** — `true` while the submit handler is executing.
* **`submitted`** — indicates that the form has completed a successful validation and submission cycle.
* **`validationMode`** — determines whether form validation executes sequentially or in parallel.
* **`errors`** — the reactive collection of field validation errors.

Because the controller is reactive, its state can be consumed directly from templates:

```html
<span @text="ud.forms.login.errors.email"></span>

<button
  type="submit"
  @attr="disabled=ud.forms.login.submitting=>'disabled'"
>
  Sign in
</button>
```

For the complete controller API, see **[Form Controllers](./controllers.md)**.

---

## Validation

Validation is attached to individual controls with `@validate`:

```html
<input
  name="email"
  @validate="required email"
/>
```

The value of `@validate` identifies validators on the component context. Multiple validators can be composed on the same field.

For example:

```html
<input
  name="email"
  @validate="required email"
/>

<input
  name="password"
  @validate="required min:8"
/>
```

Validators receive the field value, any colon-separated arguments, and a validation context:

```js
validator(value, ...args, validationContext)
```

The validation context contains:

```js
{
  trigger,
  element,
  event,
  signal,
}
```

Where:

* **`trigger`** identifies why validation was initiated.
* **`element`** is the form control being validated.
* **`event`** is the initiating event when one exists.
* **`signal`** is an `AbortSignal` for cancelling asynchronous work.

A validator returns:

* `true` when the value is valid.
* A non-empty string when the value is invalid. The string becomes the field's error message.

For example:

```js
methods: {
  required(value) {
    return value?.trim()
      ? true
      : "This field is required";
  },

  min(value, limit) {
    return !value || value.length >= Number(limit)
      ? true
      : `Must be at least ${limit} characters`;
  },
}
```

Validators may also be asynchronous:

```js
methods: {
  async uniqueEmail(value, ctx) {
    const res = await fetch(
      "/api/check-email?q=" + encodeURIComponent(value),
      {
        signal: ctx.signal,
      }
    );

    const data = await res.json();

    return data.available
      ? true
      : "Email is already registered";
  },
}
```

Using the supplied `AbortSignal` allows superseded asynchronous validations to be cancelled instead of allowing stale results to overwrite newer validation state.

See **[Validation](./validation.md)** for validator composition and the validation context, and **[Async Validation](./async.md)** for asynchronous validation and cancellation.

---

## Validation Triggers

A field's validation trigger determines **when its validators run**.

Use `@trigger` on the control:

| Trigger      | Validation runs                    |
| ------------ | ---------------------------------- |
| **`live`**   | On `input` / `change`.             |
| **`lazy`**   | On `blur`.                         |
| **`submit`** | When the parent form is submitted. |

For example:

```html
<input
  name="email"
  @validate="required email"
  @trigger="lazy"
/>
```

Multiple triggers can be combined:

```html
<input
  name="email"
  @validate="required email"
  @trigger="live lazy"
/>
```

Validation does **not** run automatically when the form is mounted. It begins when a relevant validation trigger occurs, or when form submission explicitly invokes submission validation.

This allows different fields to provide different validation experiences within the same form.

For the complete trigger behavior, see **[Validation](./validation.md)**.

---

## Validation Modes

Validation triggers determine **when** validation starts. The form's validation mode determines **how registered validation work is executed**.

Set the mode when declaring the form:

```html
<form @form="login sequential">
```

or:

```html
<form @form="login parallel">
```

`sequential` is the default.

| Mode           | Behavior                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sequential** | Validators execute one after another. Validation stops at the first failure and the first invalid field receives focus.                                                   |
| **Parallel**   | Field validations execute concurrently. The form waits for all validations to settle before determining validity and focuses the first invalid field if validation fails. |

The distinction is particularly important for asynchronous validation. Sequential validation can avoid starting subsequent work after an earlier failure, while parallel validation allows independent validations to proceed concurrently.

See **[Sequential and Parallel Validation](./sequential-parallel.md)** for the detailed execution semantics.

---

## Form Submission

`@submit` connects a form to a component method and provides the form's submission lifecycle.

It must be used on a `<form>` that also declares `@form`:

```html
<form @form="login" @submit="login">
```

When the form is submitted, the runtime:

1. Prevents the normal form submission.
2. Runs the registered submit-triggered validation according to the form's validation mode.
3. Stops submission if validation fails.
4. Focuses the first invalid field when validation fails.
5. Invokes the submit handler when validation succeeds.
6. Tracks the handler's execution through `controller.submitting`.
7. Marks the form as submitted after successful validation and successful handler completion.

Submit handlers are top-level methods on the component. Nested method paths such as `user.login` are not supported.

Optional arguments can follow the handler name:

```html
<form @form="login" @submit="login:user.id:remember">
```

The first argument passed to the submit handler is always the submit context:

```js
{
  event,
  form,
  formData,
  controller,
}
```

Where:

* **`event`** — the originating submit event.
* **`form`** — the `<form>` element.
* **`formData`** — the submitted `FormData`.
* **`controller`** — the reactive form controller corresponding to `ud.forms.login`.

A submit handler can be synchronous or asynchronous:

```js
async login({ formData, controller }) {
  console.log(Object.fromEntries(formData));

  // Submit data to an API...

  controller.reset();
}
```

`controller.submitting` remains `true` until an asynchronous handler settles. `controller.submitted` is set only after validation succeeds and the handler completes successfully.

If the handler calls `controller.reset()`, the resulting reset state is preserved.

See **[Form Submission](./submission.md)** for the complete submission lifecycle.

---

## Field State

Every validated control maintains reactive field state.

The field can be accessed through the form controller:

```js
const field = controller.getField("email");
```

A field exposes state such as:

```js
{
  element,
  name,
  value,
  touched,
  dirty,
  validating,
  initialValue,
  type,
}
```

The form controller provides field-level operations such as:

```js
controller.getField(name);
controller.getValue(name);
controller.setValue(name, value);
controller.resetField(name);
```

`getField(name)` returns:

* A single field object for an individual control.
* An array for radio or checkbox groups sharing the same name.
* `undefined` when the field does not exist.

Form-level `dirty` and `touched` state are derived from the registered fields, while validation errors are keyed by field name on `controller.errors`.

See **[Working with Fields](./fields.md)** for field registration, state, and field-level operations.

---

## Minimal End-to-End Example

The following example shows the complete form lifecycle: component state, field binding, validation, reactive validation state, submission, and reset.

```js
import { createComponent, html, render } from "udodi";

const LoginForm = createComponent({
  name: "LoginForm",

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
        : "Invalid email";
    },

    min(value, limit) {
      return !value || value.length >= Number(limit)
        ? true
        : `At least ${limit} characters`;
    },

    async login({ formData, controller }) {
      console.log(Object.fromEntries(formData));

      // Submit formData to an API...

      controller.reset();
    },
  },

  template: html`
    <form @form="login" @submit="login">
      <label>
        Email

        <input
          name="email"
          type="email"
          @bind="email"
          @validate="required email"
        />

        <span @text="ud.forms.login.errors.email"></span>
      </label>

      <label>
        Password

        <input
          name="password"
          type="password"
          @bind="password"
          @validate="required min:8"
        />

        <span @text="ud.forms.login.errors.password"></span>
      </label>

      <p @show="ud.forms.login.validating">
        Validating…
      </p>

      <p @show="ud.forms.login.submitting">
        Submitting…
      </p>

      <button
        type="submit"
        @attr="disabled=ud.forms.login.submitting=>'disabled'"
      >
        Sign in
      </button>
    </form>
  `,
});

render(LoginForm(), "#app");
```

This example demonstrates the core relationship:

```text
Component State
      │
      │ @bind
      ▼
   Form Fields
      │
      │ @validate
      ▼
   Validation
      │
      │ @form / controller
      ▼
 Form State + Errors
      │
      │ @submit
      ▼
 Submit Handler
```

The form controller acts as the coordination point between these pieces while remaining reactive and accessible from both component code and templates.

---

## Next Steps

| Goal                                                  | Guide                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| Register a form and choose its validation mode        | **[Creating a Form](./creating.md)**                               |
| Understand field registration and field state         | **[Working with Fields](./fields.md)**                             |
| Write and compose validators                          | **[Validation](./validation.md)**                                  |
| Understand sequential and parallel execution          | **[Sequential and Parallel Validation](./sequential-parallel.md)** |
| Handle form submission and its lifecycle              | **[Form Submission](./submission.md)**                             |
| Use the complete reactive controller API              | **[Form Controllers](./controllers.md)**                           |
| Build asynchronous validators and handle cancellation | **[Async Validation](./async.md)**                                 |

Form-oriented directives are part of Udodi's template system but have behavior specific to form state, validation, and submission.

For the broader template DSL, including directives such as `@bind`, `@on`, `@text`, `@attr`, and `@show`, see **[Templates and Directives](../templates/README.md)**.

For precise public API signatures, see the **[Form API Reference](../api/form.md)**.
