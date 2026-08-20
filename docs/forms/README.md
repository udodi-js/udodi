# Forms and Validation

Udodi provides a reactive form system for managing **form state, field state, validation, and submission**.

Forms are built directly into the runtime and integrate with Udodi's reactive state and template systems. A form consists of a reactive **form controller**, fields registered through their `name` attributes, validators attached with `@validate`, and submission handled through `@submit`.

The form system supports:

* Reactive form and field state
* Synchronous and asynchronous validation
* Multiple validation triggers
* Sequential and parallel validation
* Field-level error management
* Validation cancellation through `AbortSignal`
* Race-condition-safe asynchronous validation
* Programmatic field and form control
* Automatic validation during submission

## Form Directives

The form system is built around four form-specific directives:

* **`@form`** — Registers a reactive form and creates its form controller.
* **`@validate`** — Attaches one or more validators to a form field.
* **`@trigger`** — Controls when field validation runs.
* **`@submit`** — Handles form submission and coordinates form validation.

These directives work together rather than operating independently. `@form` establishes the form, field directives register validation behavior within that form, and `@submit` provides the submission lifecycle.

---

## Guides

| Guide                                                              | Description                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **[Forms Overview](./overview.md)**                                | Understand the form system, its architecture, and how forms, fields, validation, and submission fit together.       |
| **[Creating a Form](./creating.md)**                               | Register a form with `@form` and configure its validation strategy.                                                 |
| **[Working with Fields](./fields.md)**                             | Learn about field registration, names, field state, and the form controller's field API.                            |
| **[Validation](./validation.md)**                                  | Define field validators, use built-in validation patterns, create custom validators, and access validation context. |
| **[Sequential and Parallel Validation](./sequential-parallel.md)** | Understand validation execution order, early exit, concurrency, and when to use each strategy.                      |
| **[Form Submission](./submission.md)**                             | Handle `@submit`, access submitted values, and work with the submission lifecycle.                                  |
| **[Form Controllers](./controllers.md)**                           | Use the reactive form controller API for reading state, managing fields, setting errors, resetting forms, and more. |
| **[Async Validation](./async.md)**                                 | Build asynchronous validators with `AbortSignal`, cancellation, and race-condition safety.                          |

**Start here → [Forms Overview](./overview.md)**

---

## Quick Example

The following example combines form registration, field binding, validation, validation timing, reactive errors, and submission:

```js
import { createComponent, html, render } from "udodi";

const LoginForm = createComponent({
  name: "LoginForm",

  methods: {
    required(value) {
      return value?.trim() ? true : "This field is required";
    },

    email(value) {
      if (!value) return true;

      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? true
        : "Please enter a valid email";
    },

    min(value, limit) {
      return !value || value.length >= Number(limit)
        ? true
        : `Must be at least ${limit} characters`;
    },

    async login({ event, form, formData, controller }) {
      // formData contains the submitted values.
      // controller is the reactive form controller.
      console.log(formData);
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

      <button
        type="submit"
        @attr="disabled=ud.forms.login.valid=>'disabled'"
      >
        Sign in
      </button>
    </form>
  `,
});

render(LoginForm(), "#app");
```

In this example:

1. `@form="login"` creates the reactive form controller.
2. Each field is identified by its `name`.
3. `@validate` attaches validators to individual fields.
4. Validation results are exposed through `ud.forms.login.errors`.
5. `ud.forms.login.valid` reacts to the current validation state.
6. `@submit="login"` runs the form submission lifecycle.
7. The `login` method receives the submitted `formData` and form `controller`.

---

## Core Concepts

### Form Controller

A form registered with `@form` gets a reactive controller exposed through `ud.forms`.

For example:

```html
<form @form="login">
```

creates a controller available at:

```js
ud.forms.login
```

The controller exposes aggregate form state as well as methods for programmatic form and field management.

Because the controller is reactive, templates can consume its state directly:

```html
<button @attr="disabled=ud.forms.login.valid=>'disabled'">
  Sign in
</button>
```

The controller therefore provides the central state surface for both declarative templates and programmatic form control.

---

### Field State

Each registered field maintains its own state, including whether it has been touched, modified, or is currently being validated.

The form controller can access an individual field through:

```js
const field = controller.getField("email");
```

Field state is useful when building conditional validation messages, loading indicators, or other field-specific UI.

See **[Working with Fields](./fields.md)** for the complete field model and API.

---

### Validation

Validators are attached to fields with `@validate`:

```html
<input
  name="email"
  @validate="required email"
/>
```

A validator is a function available through the component context. Validators receive the field value, any arguments supplied by the directive, and a validation context:

```js
validator(value, ...args, validationContext)
```

The validation context provides information about the validation that is currently being performed:

```js
{
  trigger,
  element,
  event,
  signal
}
```

A validator returns:

* `true` — the value is valid.
* A non-empty string — the value is invalid and the string becomes the field's error message.
* A `Promise` resolving to either result — for asynchronous validation.

For example:

```js
required(value) {
  return value?.trim()
    ? true
    : "This field is required";
}
```

Asynchronous validators can use `validationContext.signal` to respond to cancellation when a newer validation supersedes an earlier one.

See **[Validation](./validation.md)** and **[Async Validation](./async.md)** for details.

---

### Validation Triggers

Validation does not have to run at the same time for every field.

Use `@trigger` to control when a field is validated:

| Trigger      | Behavior                                                         |
| ------------ | ---------------------------------------------------------------- |
| **`live`**   | Validate as the field value changes through `input` or `change`. |
| **`lazy`**   | Validate when the field loses focus through `blur`.              |
| **`submit`** | Validate when the parent form is submitted.                      |

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

This allows each field to choose an appropriate validation experience independently.

---

### Validation Modes

The form controls **how field validation is executed** when validation is performed.

Specify the mode when registering the form:

```html
<form @form="login sequential">
```

or:

```html
<form @form="login parallel">
```

The default mode is `sequential`.

#### Sequential

Validators run in order and stop when the first validation failure is encountered.

This is useful when validation has an intentional priority order or when the first invalid field should receive focus.

#### Parallel

Field validations are started concurrently and the form waits for all validations to complete before determining the final result.

This is useful when fields have independent asynchronous validators and you want them to execute concurrently.

See **[Sequential and Parallel Validation](./sequential-parallel.md)** for the execution semantics of each mode.

---

### Form Submission

`@submit` connects a form to a component method:

```html
<form @form="login" @submit="login">
```

Submission coordinates the form's validation and submission lifecycle.

A submit handler can receive:

```js
async login({ event, form, formData, controller }) {
  // ...
}
```

where:

* `event` is the originating submit event.
* `form` is the form element.
* `formData` contains the submitted field values.
* `controller` is the reactive form controller.

This keeps submission logic separate from field validation while still giving the handler access to the complete form state.

See **[Form Submission](./submission.md)** for the full submission lifecycle.

---

## Related Documentation

Form directives are part of Udodi's template DSL, but their behavior is specific to form state and validation.

For the broader template system and general-purpose directives such as `@bind`, `@on`, `@text`, `@attr`, and `@class`, see **[Templates and Directives](../templates/README.md)**.

For the complete public form API, see **[Form API Reference](../api/form.md)**.
