# Sequential and Parallel Validation

Every form registered with `@form` has a validation mode: `sequential` (the default) or `parallel`.

The mode controls how different fields participate in a full-form validation pass, particularly when the form is submitted with `@submit`.

It does **not** change the order of validators attached to a single field. Validators declared in `@validate` always execute from left to right and stop at the first failure. See [Validation](./validation.md).

---

## Setting the Mode

The optional second token of `@form` selects the validation mode:

```html
<!-- sequential (default) -->
<form @form="login">

<!-- explicit sequential -->
<form @form="login sequential">

<!-- parallel -->
<form @form="login parallel">
```

The selected mode is exposed through the form controller:

```js
ud.forms.login.validationMode; // "sequential" | "parallel"
```

Only `sequential` and `parallel` are valid modes. An unknown mode produces a warning and prevents the form from being registered.

See [Creating a Form](./creating.md).

---

## What the Mode Controls

Validation has two separate levels:

1. **Field-level validation** — the validators attached to one control.
2. **Form-level validation** — the coordination of multiple fields during a full validation pass.

The validation mode applies only to the second level.

| Situation | Affected by form mode? |
| --- | --- |
| Full-form validation during `@submit` | **Yes** — fields are scheduled sequentially or in parallel |
| Interactive `live` / `lazy` validation | **No** — only the triggering field is validated |
| Multiple validators on one field | **No** — validators always execute sequentially |

For example:

```html
<input
  name="password"
  @validate="required min:8 strongPassword"
/>
```

These validators always execute in this order:

```text
required → min:8 → strongPassword
```

The form's validation mode does not change that order.

Instead:

```html
<form @form="signup parallel">
```

controls how `email`, `password`, `username`, etc. are coordinated when the form performs a full validation.

---

## Sequential Mode

Sequential validation is the default.

```html
<form @form="signup sequential" @submit="signup">
  <input
    name="email"
    @validate="required email"
  />

  <input
    name="password"
    @validate="required min:8"
  />

  <input
    name="confirm"
    @validate="required matchesPassword"
  />
</form>
```

During a full validation pass, fields are processed one at a time.

### Execution

```text
email
  │
  ├── invalid → stop → focus email
  │
  └── valid
        │
        ▼
     password
        │
        ├── invalid → stop → focus password
        │
        └── valid
              │
              ▼
           confirm
              │
              ├── invalid → stop → focus confirm
              │
              └── valid → submit handler
```

The runtime:

1. Validates the first registered field.
2. Waits for that field's validation to finish.
3. Stops immediately if the field is invalid.
4. Focuses the invalid field.
5. Does not validate subsequent fields during that cycle.
6. Invokes the submit handler only if every field succeeds.

### When sequential validation is useful

Sequential mode is a good fit when:

* early failure should avoid unnecessary work;
* later validation may be expensive;
* the desired UX is to guide the user through one problem at a time;
* field order naturally represents the order in which problems should be resolved.

It can also be preferable when later checks depend conceptually on earlier fields being valid.

---

## Parallel Mode

Parallel validation validates all registered fields concurrently during a full validation pass.

```html
<form @form="signup parallel" @submit="signup">
  <input
    name="email"
    @validate="required uniqueEmail"
  />

  <input
    name="username"
    @validate="required uniqueUsername"
  />

  <input
    name="password"
    @validate="required min:8"
  />
</form>
```

The runtime starts validation for all fields without waiting for one field to finish before starting the next.

```text
email ────────────────┐
username ─────────────┼──► wait for all
password ─────────────┘        │
                               ├── all valid → submit
                               │
                               └── any invalid → focus first invalid
```

The runtime:

1. Starts validation for all registered fields.
2. Waits for every field's validation cycle to finish.
3. Determines the final form validity.
4. If any field failed, focuses the first invalid field in registration order.
5. Does not invoke the submit handler when validation fails.
6. Invokes the submit handler only when every field succeeds.

Because all fields are allowed to finish, multiple errors can be populated during the same validation cycle.

### When parallel validation is useful

Parallel mode is particularly useful when:

* you want to display all current field errors after submission;
* fields perform independent asynchronous checks;
* remote validations can execute concurrently;
* waiting for the slowest validation is preferable to sequential early exit.

---

## Focus Behavior

Both modes focus the first invalid field when a full form validation fails.

| Mode | Focused field |
| --- | --- |
| **Sequential** | The field that failed and caused validation to stop |
| **Parallel** | The first invalid field in registration order |

Registration order is determined by the order in which validated controls are registered with the form, which normally corresponds to document order for static markup.

Parallel validation therefore does not focus whichever asynchronous validator happens to finish first.

---

## Async Validators

Both modes support asynchronous validators.

### Sequential

Each field must finish before the next field begins:

```text
field A
   │
   └── await
         │
         ▼
      field B
         │
         └── await
               │
               ▼
            field C
```

A slow asynchronous validator therefore delays subsequent fields.

If a field fails, later fields are skipped.

### Parallel

All fields begin validation without waiting for one another:

```text
field A ──────────┐
field B ──────────┼──► wait for all
field C ──────────┘
```

The form waits until every field's validation cycle has completed before deciding whether submission can continue.

Individual asynchronous validations remain responsible for cancellation and race safety through their validation context and `AbortSignal`.

See [Async Validation](./async.md).

While any validation is pending, the form controller's:

```js
ud.forms.login.validating
```

remains `true`.

---

## Interactive Validation vs Full Validation

`@trigger` and the form's validation mode solve different problems.

`@trigger` determines when a particular field validates:

```html
<form @form="profile parallel" @submit="save">
  <input
    name="email"
    @validate="required email"
    @trigger="live"
  />

  <input
    name="bio"
    @validate="max:280"
    @trigger="lazy"
  />

  <input
    name="website"
    @validate="url"
    @trigger="submit"
  />
</form>
```

During normal interaction:

* typing in `email` validates `email`;
* leaving `bio` validates `bio`;
* `website` waits for submission.

These interactions do not cause the entire form to validate.

When `@submit` performs full validation, however, the form validates its registered fields using the configured mode.

Thus:

```text
@trigger
   ↓
When should this field validate?

@form="... sequential|parallel"
   ↓
How should fields be coordinated during full validation?
```

A field using `@trigger="live"` is therefore not excluded from submit validation.

---

## Field Validators Remain Sequential

The form mode should not be confused with validator ordering.

Given:

```html
<input
  name="password"
  @validate="required min:8 strongPassword"
/>
```

the validators always run sequentially:

```text
required
   │
   ├── failure → stop
   │
   └── success
         ↓
       min:8
         │
         ├── failure → stop
         │
         └── success
               ↓
          strongPassword
```

Even when the form uses:

```html
<form @form="signup parallel">
```

the fields are parallelized; the validators within each field are not.

This distinction keeps validator composition deterministic while allowing independent fields to execute concurrently.

---

## Choosing a Mode

| Prefer sequential when… | Prefer parallel when… |
| --- | --- |
| Early failure should avoid later work | You want errors from multiple fields together |
| Some validations are expensive | Fields have independent async validations |
| The UX should guide users field by field | Independent checks can run concurrently |
| Validation naturally follows field order | The slowest validation determines total latency |

The choice is local to each form. A component can contain multiple forms with different validation modes:

```html
<form @form="login sequential">
  ...
</form>

<form @form="registration parallel">
  ...
</form>
```

Each form maintains its own controller, field registry, and validation mode.

---

## Example

The following example can be switched between sequential and parallel behavior by changing the second `@form` token:

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
      return value?.trim() ? true : "Required";
    },

    email(value) {
      if (!value) return true;

      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? true
        : "Invalid email";
    },

    min(value, n) {
      return !value || value.length >= Number(n)
        ? true
        : `At least ${n} characters`;
    },

    async signup({ formData, controller }) {
      console.log(Object.fromEntries(formData));
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

      <button type="submit">
        Create account
      </button>
    </form>
  `,
});

render(SignupForm(), "#app");
```

With both fields empty:

**Parallel mode** allows both fields to complete validation, so both:

```js
ud.forms.signup.errors.email
ud.forms.signup.errors.password
```

can contain errors after the submit attempt. Focus then moves to the first invalid field in registration order.

**Sequential mode** stops at the first invalid field. The later field is not validated during that submit cycle, so its error may remain empty until the earlier failure is corrected and the form is submitted again.

---

## Key Takeaway

The distinction can be summarized as:

```text
@validate
    │
    └── What validators belong to this field?

@trigger
    │
    └── When should this field validate?

@form="name sequential"
    │
    └── Validate fields one at a time during full validation

@form="name parallel"
    │
    └── Validate fields concurrently during full validation
```

Sequential and parallel modes control field-level scheduling during full-form validation; they do not alter validator ordering within an individual field.

---

## Next Steps

| Goal | Guide |
| --- | --- |
| Field triggers and validator composition | [Validation](./validation.md) |
| Submit validation and handler lifecycle | [Form Submission](./submission.md) |
| Async validators and cancellation | [Async Validation](./async.md) |
| Form controller state and `validationMode` | [Form Controllers](./controllers.md) |
| Registering a form | [Creating a Form](./creating.md) |

For the overall form architecture, see [Forms Overview](./overview.md).
