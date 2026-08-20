# Validation

Udodi validates form controls through the `@validate` directive.

Validators are ordinary component methods. They run according to a field's `@trigger` configuration, write their results to the form controller's reactive `errors` object, and participate automatically in form submission.

This guide covers:

* Declaring validators with `@validate`
* Validation triggers with `@trigger`
* Validator signatures and return values
* Validation context
* Validation errors
* Multiple validators on one field
* Values passed to validators
* Handling missing or invalid validators

For form-level sequential and parallel execution, see [Sequential and Parallel Validation](./sequential-parallel.md).

For asynchronous validators, `AbortSignal`, cancellation, and race-condition safety, see [Async Validation](./async.md).

---

## Declaring Validators

`@validate` accepts one or more validator names separated by whitespace:

```html
<input
  name="email"
  @validate="required"
/>

<input
  name="email"
  @validate="required email"
/>

<input
  name="password"
  @validate="required min:8"
/>

<input
  name="age"
  @validate="between:18:120"
/>
```

Each validator name must resolve to a callable function on the component context, typically a method declared under `methods`.

Validator names are single identifiers. Nested paths and arbitrary expressions are not supported:

```html
<!-- Valid -->
<input @validate="required email" />

<!-- Invalid -->
<input @validate="validators.required" />

<!-- Invalid -->
<input @validate="user.validators.required" />
```

### Validator Arguments

Arguments can be supplied after the validator name using `:`:

```html
<input @validate="min:8" />
<input @validate="between:18:120" />
```

Conceptually, these become:

```text
@validate="required"       → required(value, ctx)
@validate="min:8"          → min(value, 8, ctx)
@validate="between:18:120" → between(value, 18, 120, ctx)
```

Arguments are evaluated according to Udodi's directive argument rules before being passed to the validator.

A quoted string literal is not a valid validator declaration:

```html
<!-- Invalid -->
<input @validate="'required'" />
```

Use the validator identifier directly:

```html
<!-- Valid -->
<input @validate="required" />
```

---

## Validation Triggers

Validation does not run when a field is registered or when the component mounts.

It runs when one of the field's configured validation triggers occurs.

| Trigger | When validation runs |
| --- | --- |
| **`live`** (default) | On `input` / `change`, depending on the control type |
| **`lazy`** | On `blur` |
| **`submit`** | When the parent form is submitted through `@submit` |

### Live Validation

`live` is the default:

```html
<input
  name="email"
  @validate="required email"
/>
```

Text-like controls are validated as their value changes. Checkbox, radio, and select controls use their appropriate change event.

### Lazy Validation

Use `lazy` when validation should wait until the user leaves the field:

```html
<input
  name="email"
  @validate="required email"
  @trigger="lazy"
/>
```

### Submit Validation

Use `submit` when a field should only be validated as part of form submission:

```html
<input
  name="email"
  @validate="required email"
  @trigger="submit"
/>
```

The field must belong to a `<form>` registered with `@form`. Otherwise, the runtime warns and does not register the submit-linked validation.

### Combining Triggers

Multiple triggers can be specified:

```html
<input
  name="email"
  @validate="required email"
  @trigger="live lazy"
/>
```

The field then validates on both input/change and blur.

If `@trigger` is omitted, `live` is used.

Unknown trigger tokens produce a warning and are ignored.

### Triggers and Validation Modes

Triggers determine when a field is validated.

They do not determine how validators for different fields are scheduled during full-form validation.

For example:

```html
<form @form="signup parallel">
  <input
    name="email"
    @validate="required email"
    @trigger="live"
  />

  <input
    name="password"
    @validate="required min:8"
    @trigger="submit"
  />
</form>
```

The field triggers control interactive validation, while the form's validation mode controls full-form validation such as validation initiated by `@submit`.

See [Sequential and Parallel Validation](./sequential-parallel.md).

---

## Writing Validators

Validators are component methods, usually declared under `methods`:

```js
const ContactForm = createComponent({
  name: "ContactForm",

  methods: {
    required(value) {
      return value?.trim()
        ? true
        : "This field is required";
    },
  },
});
```

### Signature

A validator receives:

```js
validator(value, ...args, validationContext)
```

The arguments are:

| Argument | Meaning |
| --- | --- |
| **`value`** | Current value of the form control. |
| **`...args`** | Values supplied after `:` in the validator declaration. |
| **`validationContext`** | Metadata describing the current validation cycle. |

For example:

```html
<input @validate="min:8" />
```

corresponds conceptually to:

```js
min(value, 8, ctx);
```

### Validator Return Values

A validator communicates its result through its return value:

| Return value | Meaning |
| --- | --- |
| **`true`** | Validation succeeded. |
| **Non-empty string** | Validation failed; the string becomes the error message. |
| **Anything else** | Validation failed with the runtime's default error message. |

For example:

```js
required(value) {
  return value?.trim()
    ? true
    : "This field is required";
}
```

A successful validator returns:

```js
return true;
```

A failed validator returns an error message:

```js
return "Please enter a valid email";
```

An empty string is not a successful validation result. Validators should explicitly return `true` for success.

### First Failure Wins

Validators declared on the same field always execute sequentially.

Validation stops at the first failing validator:

```html
<input
  name="password"
  @validate="required min:8 strongPassword"
/>
```

The runtime evaluates:

```text
required
   │
   ├── failure → stop
   │
   └── success
         │
         ▼
       min:8
         │
         ├── failure → stop
         │
         └── success
               │
               ▼
        strongPassword
```

Form-level parallel validation does not change this behavior. Parallel mode controls validation across different fields, not the order of validators attached to one field.

### Example Validators

```js
methods: {
  required(value) {
    return value?.trim()
      ? true
      : "This field is required";
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

  between(value, min, max) {
    const number = Number(value);

    if (Number.isNaN(number)) {
      return "Must be a number";
    }

    if (
      number < Number(min) ||
      number > Number(max)
    ) {
      return `Must be between ${min} and ${max}`;
    }

    return true;
  },
}
```

These validators can then be composed declaratively:

```html
<input
  name="email"
  @validate="required email"
/>

<input
  name="password"
  @validate="required min:8"
/>

<input
  name="age"
  @validate="required between:18:120"
/>
```

Udodi does not provide built-in `required`, `email`, `min`, or similar validators. They are application-defined component methods.

---

## Validation Context

Every validator receives a validation context as its final argument:

```js
{
  trigger,
  element,
  event,
  signal,
}
```

### `trigger`

Identifies why the validation cycle was started:

```js
ctx.trigger
```

Possible values are:

* `"live"`
* `"lazy"`
* `"submit"`

A validator can use this when its behavior needs to differ between interactive and submit validation:

```js
required(value, ctx) {
  if (!value?.trim()) {
    if (ctx.trigger === "submit") {
      return "This field is required";
    }

    return true;
  }

  return true;
}
```

### `element`

The DOM control currently being validated:

```js
ctx.element
```

This provides access to the underlying form control when a validator needs DOM-specific information.

### `event`

The DOM event that initiated validation, when one exists:

```js
ctx.event
```

For example, live validation may receive the originating `input` or `change` event.

Submit-triggered validation can receive the submit event associated with the form submission.

### `signal`

An `AbortSignal` associated with the current validation cycle:

```js
ctx.signal
```

Asynchronous validators should pass this signal to cancellable operations such as `fetch`:

```js
async uniqueEmail(value, ctx) {
  const response = await fetch(
    "/api/check-email?q=" + encodeURIComponent(value),
    {
      signal: ctx.signal,
    },
  );

  const data = await response.json();

  return data.available
    ? true
    : "Email is already registered";
}
```

See [Async Validation](./async.md) for the complete asynchronous validation model.

---

## Errors on the Form Controller

When a named field fails validation, its error is stored on the form controller:

```js
ud.forms.login.errors.email;
```

The value is:

```text
""                       → no validation error
"This field is required" → validation failed
```

For example:

```html
<input
  name="email"
  @validate="required email"
/>

<span @text="ud.forms.login.errors.email"></span>
```

The error object is reactive, so changes are reflected automatically in templates.

### Error Requirements

A field needs a non-empty `name` for a field-specific error entry to exist:

```html
<input
  name="email"
  @validate="required"
/>
```

creates:

```js
ud.forms.login.errors.email;
```

A validated control without a name can still run validation, but its error cannot be represented by a named entry in `errors`.

### Form Validity

The form controller's `valid` state is derived from its `errors` object.

A form is valid only when every error entry is an empty string:

```js
controller.valid === true;
```

When validation succeeds, the field's previous error is cleared back to:

```js
controller.errors.email === "";
```

Errors can also be managed explicitly:

```js
controller.setError(
  "email",
  "This email address is already registered",
);

controller.resetError("email");
```

These methods change the error state without executing validators and are useful for server-side validation results.

See [Form Controllers](./controllers.md).

---

## Multiple Validators on One Field

A field can declare multiple validators:

```html
<input
  name="password"
  @validate="required min:8 strongPassword"
/>
```

They always execute in declaration order:

1. `required` runs.
2. If it succeeds, `min:8` runs.
3. If that succeeds, `strongPassword` runs.
4. The first failure stops the validation cycle.

For example, if `required` fails:

```text
required       → failure
min:8          → skipped
strongPassword → skipped
```

If `required` succeeds but `min:8` fails:

```text
required       → success
min:8          → failure
strongPassword → skipped
```

This ordering is independent of the form's validation mode.

### Single Field vs Full Form

The distinction is important:

**Within one field:**

```text
validator 1 → validator 2 → validator 3
```

is always sequential.

**Across multiple fields:**

```text
email
password
username
```

can be validated sequentially or in parallel depending on the form's validation mode.

See [Sequential and Parallel Validation](./sequential-parallel.md).

---

## Values Passed to Validators

Validators receive the current value of the DOM control.

| Control | Value passed to validator |
| --- | --- |
| Text-like controls | `element.value` |
| `<textarea>` | `element.value` |
| `<select>` | `element.value` |
| Checkbox | `element.checked` |
| Radio | `element.value` when checked |

For radio controls, unchecked controls are skipped rather than being validated with a `null` value.

The same value semantics are used by the field system. See [Working with Fields](./fields.md).

### Validation and `@bind`

Validation reads the DOM control, not component state directly.

For example:

```html
<input
  name="email"
  @bind="email"
  @validate="required email"
/>
```

`@bind` keeps component state synchronized with the DOM, while `@validate` reads the current DOM value when validation runs.

This separation allows validation to work even when `@bind` is not present:

```html
<input
  name="email"
  @validate="required email"
/>
```

In that case, the application can use `FormData` during submission or access the control through the form controller.

---

## Missing or Invalid Validators

Every validator name must resolve to a callable function on the component context.

If it does not:

* The runtime logs a warning.
* The validator is treated as invalid.
* The validation cycle receives the runtime's default error message.

For example:

```html
<input
  name="email"
  @validate="doesNotExist"
/>
```

produces a warning because `doesNotExist` cannot be resolved to a validator function.

The same applies to unsupported nested paths:

```html
<input
  name="email"
  @validate="validators.required"
/>
```

and non-callable values.

Keep validator declarations to top-level component methods:

```js
methods: {
  required(value) {
    return value?.trim()
      ? true
      : "Required";
  },
}
```

```html
<input
  name="email"
  @validate="required"
/>
```

---

## Minimal Example

```js
import { createComponent, html, render } from "udodi";

const ContactForm = createComponent({
  name: "ContactForm",

  state() {
    return {
      email: "",
      message: "",
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

    min(value, length) {
      return !value ||
        value.length >= Number(length)
        ? true
        : `At least ${length} characters`;
    },
  },

  template: html`
    <form @form="contact">
      <label>
        Email
        <input
          name="email"
          type="email"
          @bind="email"
          @validate="required email"
          @trigger="lazy"
        />
        <span @text="ud.forms.contact.errors.email"></span>
      </label>

      <label>
        Message
        <textarea
          name="message"
          @bind="message"
          @validate="required min:10"
        ></textarea>
        <span @text="ud.forms.contact.errors.message"></span>
      </label>

      <p @show="ud.forms.contact.validating">
        Validating…
      </p>

      <p @show="ud.forms.contact.valid">
        All fields look good
      </p>
    </form>
  `,
});

render(ContactForm(), "#app");
```

In this example:

* `email` uses `required` and `email` validators.
* Email validation runs on blur because of `@trigger="lazy"`.
* `message` uses `required` and `min:10`.
* Validators execute in declaration order.
* The first failing validator determines the field's error.
* Errors are exposed reactively through `ud.forms.contact.errors`.
* `validating` and `valid` can be consumed directly from the reactive form controller.

---

## Next Steps

| Goal | Guide |
| --- | --- |
| Understand sequential vs parallel form validation | [Sequential and Parallel Validation](./sequential-parallel.md) |
| Handle `@submit` and automatic validation | [Form Submission](./submission.md) |
| Understand field state and `getField()` | [Working with Fields](./fields.md) |
| Use the controller API (`errors`, `setError`, etc.) | [Form Controllers](./controllers.md) |
| Build async validators and handle cancellation | [Async Validation](./async.md) |

For registering a form and choosing its validation mode, see [Creating a Form](./creating.md).

For the overall form architecture, see [Forms Overview](./overview.md).
