# Form Submission

Form submission in Udodi is handled by the `@submit` directive on a `<form>` that also declares `@form`.

Before the submit handler runs, the runtime validates all registered fields according to the form’s validation mode. Only if validation succeeds does the handler execute.

This guide covers:

* Declaring `@submit`
* Submit handlers and their arguments
* The submission lifecycle
* Validation during submission
* `submitting` and `submitted`
* Synchronous and asynchronous handlers
* Server-side errors
* Common mistakes

For validation modes, see [Sequential and Parallel Validation](./sequential-parallel.md). For writing validators, see [Validation](./validation.md).

---

## Requirements

`@submit` must be used on a native `<form>` that also declares `@form`:

```html
<form @form="login" @submit="login">
  ...
</form>
```

If `@form` is missing, the runtime logs a warning and does not bind the submit handler.

`@submit` does not replace the native submit mechanism. Use a submit control or call `form.requestSubmit()` so the form's native submit event is dispatched.

For example:

```html
<button type="submit">Sign in</button>
```

Udodi listens for that native event and runs its submission pipeline.

---

## Declaring the Submit Handler

The `@submit` value consists of a top-level handler name, optionally followed by colon-separated arguments:

```html
<form @form="login" @submit="login">
<form @form="login" @submit="login:user.id">
<form @form="login" @submit="login:user.id:remember">
```

The arguments are evaluated immediately before the handler is invoked.

| Directive | Handler invocation |
| --- | --- |
| `@submit="login"` | `login(submitContext)` |
| `@submit="login:user.id"` | `login(submitContext, user.id)` |
| `@submit="login:user.id:remember"` | `login(submitContext, user.id, remember)` |

### Handler rules

The handler must be a single identifier that resolves to a function on the component context.

```html
<!-- Valid -->
<form @form="login" @submit="login">
```

Nested handler paths are not supported:

```html
<!-- Invalid -->
<form @form="login" @submit="user.login">
```

Quoted string literals are also not valid:

```html
<!-- Invalid -->
<form @form="login" @submit="'login'">
```

If the handler does not resolve to a function, the runtime logs a warning and does not bind submission.

---

## Submission Lifecycle

When the native submit event fires, Udodi runs the following pipeline:

```text
submit event
    │
    ├── preventDefault()
    │
    ├── already submitting?
    │       └── yes → return
    │
    ├── submitting = true
    │
    ├── validate all registered fields
    │       │
    │       ├── sequential
    │       └── parallel
    │
    ├── validation failed?
    │       │
    │       ├── focus first invalid field
    │       ├── submitting = false
    │       └── return
    │
    ├── create submit context
    │
    ├── invoke submit handler
    │       └── await if necessary
    │
    ├── successful handler?
    │       └── submitted = true
    │
    └── submitting = false
```

### 1. Prevent the browser's default submission

Udodi calls `event.preventDefault()`.

The browser therefore does not navigate away or perform a native form submission automatically. Side effects such as API requests are handled by the submit method.

### 2. Prevent overlapping submissions

If:

```js
controller.submitting === true
```

when another submit event occurs, the new submission is ignored.

This prevents multiple concurrent submit handlers from being started accidentally.

### 3. Validate the form

All registered field validators participate in the full submit validation pass.

The form's configured validation mode determines whether fields are processed sequentially or in parallel.

### 4. Stop on validation failure

If validation fails:

* the submit handler is not called;
* the first invalid field receives focus;
* `controller.submitting` returns to `false`.

### 5. Invoke the handler

When validation succeeds, Udodi creates the submit context and invokes the configured handler.

The handler can be synchronous or asynchronous.

### 6. Track successful submission

After successful validation and successful completion of the handler, `controller.submitted` becomes `true`.

If the handler calls `controller.reset()`, the reset state is preserved rather than being immediately overwritten by the submission lifecycle.

### 7. Clear `submitting`

`controller.submitting` is cleared when the submission pipeline finishes, including when the handler throws or rejects.

Handler errors are logged as warnings; they do not leave the form permanently stuck in the submitting state.

---

## Submit Context

Every submit handler receives a context object as its first argument:

```js
{
  event,       // native submit event
  form,        // the <form> element
  formData,    // FormData created from the form
  controller,  // reactive form controller
}
```

For example:

```js
methods: {
  async login({ event, form, formData, controller }, userId) {
    const payload = Object.fromEntries(formData);

    console.log(payload);
    console.log(userId);

    await api.login(payload);
  },
}
```

The corresponding template can pass an additional argument:

```html
<form @form="login" @submit="login:user.id">
```

Additional arguments follow the submit context in the same order in which they appear in the directive.

### `event`

The native `SubmitEvent` that initiated the submission.

### `form`

The native `<form>` element.

### `formData`

A `FormData` snapshot created from the form at submission time.

It reflects the native form controls and their name/value semantics and is independent of whether a control uses `@bind`.

For example:

```js
const payload = Object.fromEntries(formData);
```

### `controller`

The reactive form controller associated with the form:

```js
controller === ud.forms.login
```

The handler can therefore use controller methods such as:

```js
controller.reset();
controller.setError("email", "Email is already registered");
controller.getValue("email");
```

See [Form Controllers](./controllers.md).

---

## Validation on Submit

Submitting a form performs a full-form validation pass.

All fields registered with `@validate` participate, regardless of their interactive trigger.

For example:

```html
<form @form="signup parallel" @submit="signup">
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

Both fields participate when the form is submitted.

`@trigger` controls interactive validation. It does not exclude a registered field from submit validation.

| Mode | Submit behavior |
| --- | --- |
| **sequential** | Fields validate one after another; the first failure stops the pass |
| **parallel** | All fields validate concurrently; the form waits for all to finish |

In both modes, the submit handler runs only when the full validation pass succeeds.

See [Sequential and Parallel Validation](./sequential-parallel.md).

While validation is running:

```js
controller.validating
```

may be `true`.

After validation completes:

```js
controller.valid
```

reflects the current validation state.

---

## `submitting` and `submitted`

The form controller exposes two submission lifecycle flags:

| Flag | Meaning |
| --- | --- |
| **`submitting`** | `true` while the submission pipeline is active |
| **`submitted`** | `true` after validation and successful handler completion |

`submitting` begins when the submit pipeline starts and remains `true` while validation and the submit handler are running.

It returns to `false` when the pipeline exits, including validation failure or handler failure.

`submitted` is set only after:

* full validation succeeds; and
* the submit handler completes successfully.

### Typical UI

```html
<button
  type="submit"
  @attr="disabled=ud.forms.login.submitting=>'disabled'"
>
  Sign in
</button>

<p @show="ud.forms.login.submitting">
  Signing in…
</p>
```

If the UI needs to derive more complex state from the controller, use a component computed value rather than calling controller methods directly from template expressions.

### Interaction with `reset()`

A successful submit handler will often want to reset the form:

```js
async login({ formData, controller }) {
  await api.login(Object.fromEntries(formData));
  controller.reset();
}
```

`reset()` clears the form's interaction, validation, and error state according to the controller's reset semantics.

Importantly, the submission lifecycle does not immediately force `submitted = true` after the handler has explicitly reset the controller.

This allows:

```js
controller.reset();
```

to remain the authoritative state transition.

That is useful when a successful submission should return the form immediately to its clean initial state without producing an unwanted `submitted` state afterward.

See [Form Controllers](./controllers.md).

---

## Synchronous Handlers

Submit handlers may perform synchronous work:

```js
methods: {
  save({ formData, controller }) {
    const payload = Object.fromEntries(formData);
    saveLocally(payload);
    controller.reset();
  },
}
```

The runtime treats completion of the synchronous handler as successful handler completion.

---

## Asynchronous Handlers

Handlers can also return a promise:

```js
methods: {
  async save({ formData, controller }) {
    const payload = Object.fromEntries(formData);
    await api.save(payload);
    controller.reset();
  },
}
```

Udodi waits for the promise to settle before completing the submission lifecycle.

While the promise is pending:

```js
controller.submitting === true
```

After successful completion:

```js
controller.submitting === false
controller.submitted === true
```

If the handler rejects or throws:

* the error is logged as a warning;
* `submitting` is cleared;
* `submitted` is not marked successful.

---

## Server Errors After Validation

Client-side validation cannot guarantee that the server will accept a submission.

A request can pass every client validator and still fail because of:

* a duplicate account;
* an expired session;
* a business-rule violation;
* a server-side validation rule;
* a resource conflict.

Use `controller.setError()` to expose a server-side error through the same reactive `errors` object:

```js
methods: {
  async login({ formData, controller }) {
    const res = await api.login(Object.fromEntries(formData));

    if (!res.ok) {
      controller.setError(
        "email",
        res.message || "Login failed"
      );
      return;
    }

    controller.reset();
  },
}
```

The template can display the error normally:

```html
<span @text="ud.forms.login.errors.email"></span>
```

`setError()` updates the controller's error state without executing the field's validators again.

See [Form Controllers](./controllers.md).

---

## Minimal Example

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
      return value?.trim() ? true : "Required";
    },

    email(value) {
      if (!value) return true;

      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? true
        : "Enter a valid email";
    },

    min(value, n) {
      return !value || value.length >= Number(n)
        ? true
        : `At least ${n} characters`;
    },

    async login({ formData, controller }) {
      const payload = Object.fromEntries(formData);

      // Send payload to your API.
      console.log(payload);

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

      <button
        type="submit"
        @attr="disabled=ud.forms.login.submitting=>'disabled'"
      >
        Sign in
      </button>

      <p @show="ud.forms.login.submitting">
        Signing in…
      </p>
    </form>
  `,
});

render(LoginForm(), "#app");
```

The important pieces are:

```html
<form @form="login" @submit="login">
```

which registers both the form controller and submit pipeline,

```html
@validate="required email"
```

which registers field validators,

and:

```js
async login({ formData, controller }) {
  await api.login(Object.fromEntries(formData));
  controller.reset();
}
```

which handles the successful submission.

---

## Common Mistakes

| Mistake | Result |
| --- | --- |
| `@submit` without `@form` on the same `<form>` | Warning; submission is not bound |
| `@submit="user.login"` | Warning; nested handler paths are not supported |
| `@submit="'login'"` | Warning; quoted handler expressions are invalid |
| Handler does not resolve to a function | Warning; submission is not bound |
| Expecting native form navigation | Default submission is prevented |
| Assuming only `@trigger="submit"` fields validate on submit | All registered validators participate in full-form validation |
| Starting another submit while `submitting` is true | The new submit event is ignored |
| Expecting `submitted` after a failed handler | `submitted` remains `false` |
| Expecting `submitted` to override `controller.reset()` | An explicit reset remains authoritative |

---

## Submission Model

The complete relationship between the form directives is:

```text
<form @form="login" @submit="login">
       │                  │
       │                  └── submission pipeline
       │
       └── form controller
                │
                ├── @validate fields
                │       │
                │       └── validators
                │
                ├── validationMode
                │       ├── sequential
                │       └── parallel
                │
                ├── errors
                ├── valid
                ├── validating
                ├── submitting
                └── submitted
```

The key rule is:

**`@submit` does not merely call a method.** It is the entry point to the complete form submission pipeline: prevent default → validate → focus on failure → invoke the handler → track submission state.

---

## Next Steps

| Goal | Guide |
| --- | --- |
| Sequential vs parallel submit validation | [Sequential and Parallel Validation](./sequential-parallel.md) |
| Field validators and triggers | [Validation](./validation.md) |
| Form controller API | [Form Controllers](./controllers.md) |
| Async validators and cancellation | [Async Validation](./async.md) |
| Field state and `FormData` | [Working with Fields](./fields.md) |

For registering the form itself, see [Creating a Form](./creating.md). For the overall form architecture, see [Forms Overview](./overview.md).
