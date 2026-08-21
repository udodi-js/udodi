# Async Validation

Udodi supports asynchronous validators through `@validate`. An async validator is simply a validator that returns a Promise. The form runtime tracks pending validation, passes an `AbortSignal` to every validation cycle, and prevents stale asynchronous results from overwriting newer validation state.

This guide covers:

- Writing asynchronous validators
- Using the validation `AbortSignal`
- Cancellation and superseded validation
- Validation race safety
- Async validation with `live`, `lazy`, and `submit`
- Async validation in sequential and parallel forms
- Handling errors and cleanup
- Practical patterns for remote validation

For validator syntax and return values, see [Validation](./validation.md). For form-level scheduling, see [Sequential and Parallel Validation](./sequential-parallel.md). For submission behavior, see [Form Submission](./submission.md).

---

## What Makes a Validator Asynchronous?

A validator is asynchronous when it returns a Promise:

```js
methods: {
  async uniqueEmail(value, ctx) {
    if (!value) return true;

    const response = await fetch(
      `/api/users/check-email?email=${encodeURIComponent(value)}`,
      { signal: ctx.signal }
    );

    const result = await response.json();

    return result.available
      ? true
      : "This email is already registered";
  },
}
```

The validator contract is otherwise unchanged:

```js
validator(value, ...args, validationContext)
```

It may return:

- `true` — valid
- a non-empty string — invalid, using that string as the error
- another value — invalid with Udodi's default validation message
- a Promise resolving to one of the above

Udodi waits for the Promise before completing that field's validation cycle.

---

## The Validation Context

Every validator receives a context object as its final argument:

```js
{
  trigger,   // "live" | "lazy" | "submit"
  element,   // the validated DOM control
  event,     // initiating DOM event, when available
  signal,    // AbortSignal for this validation cycle
}
```

The `signal` is the important part for asynchronous validation.

Pass it to APIs that support cancellation:

```js
async uniqueUsername(value, ctx) {
  const response = await fetch(
    `/api/users/check-username?username=${encodeURIComponent(value)}`,
    { signal: ctx.signal }
  );

  const result = await response.json();

  return result.available
    ? true
    : "Username is already taken";
}
```

This allows a newer validation cycle to cancel work that is no longer relevant.

---

## Why Cancellation Matters

Consider a field using the default `live` trigger:

```html
<input
  name="username"
  @validate="required uniqueUsername"
/>
```

A user may type:

```text
a
al
ali
alic
alice
```

That can produce several validation cycles before the first network request finishes.

Without cancellation or stale-result protection, an older request could finish after the newest request and incorrectly replace the current error:

```text
alice      → valid
alic       → invalid
```

If the `alic` request finishes last, the UI could incorrectly report the current value as invalid.

Udodi prevents this class of race condition by treating each validation cycle as current only while it remains active. Superseded validation cannot commit its result over a newer cycle.

Cancellation is therefore both a performance mechanism and a correctness mechanism.

---

## AbortSignal and Fetch

The preferred pattern for network validators is to pass `ctx.signal` directly to `fetch`:

```js
methods: {
  async uniqueEmail(value, ctx) {
    if (!value) return true;

    const response = await fetch(
      `/api/users/check-email?email=${encodeURIComponent(value)}`,
      {
        signal: ctx.signal,
      }
    );

    if (!response.ok) {
      return "Unable to verify this email";
    }

    const { available } = await response.json();

    return available
      ? true
      : "This email is already registered";
  },
}
```

`fetch` understands `AbortSignal`, so when the validation cycle is superseded, the request can be aborted rather than allowed to continue unnecessarily.

Do not create an unrelated `AbortController` when the operation belongs to the current validation cycle:

```js
// Prefer this
fetch(url, { signal: ctx.signal });
```

The runtime owns the lifecycle of `ctx.signal`.

---

## Handling Aborted Work

An aborted asynchronous operation should normally not become a validation error.

For example:

```js
methods: {
  async uniqueUsername(value, ctx) {
    try {
      const response = await fetch(
        `/api/users/check-username?username=${encodeURIComponent(value)}`,
        { signal: ctx.signal }
      );

      const { available } = await response.json();

      return available
        ? true
        : "Username is already taken";
    } catch (error) {
      if (ctx.signal.aborted) {
        return true;
      }

      return "Unable to verify username";
    }
  },
}
```

The important distinction is:

- **Abort** — the validation is no longer relevant; do not present it as a validation failure.
- **Network/server failure** — the validation operation failed while still current; decide whether to return an error message or handle the failure according to your application policy.

In most cases, returning `true` for an aborted cycle is only a defensive fallback. The runtime already prevents a superseded validation result from becoming the current field result.

---

## Non-Fetch Asynchronous Work

`AbortSignal` is useful beyond `fetch`.

If an API accepts a signal, pass it through:

```js
async checkAvailability(value, ctx) {
  return availabilityService.check(value, {
    signal: ctx.signal,
  });
}
```

For custom asynchronous work that does not natively support cancellation, observe the signal yourself:

```js
async slowCheck(value, ctx) {
  const result = await doAsyncWork(value);

  if (ctx.signal.aborted) {
    return true;
  }

  return result.ok ? true : "The value is not accepted";
}
```

This does not stop `doAsyncWork()` itself, but it prevents obsolete work from being committed as the current validation result.

If you control the asynchronous API, prefer making it accept an `AbortSignal` so the underlying operation can actually be cancelled.

---

## Validation State While Async Work Is Pending

While an asynchronous validation cycle is running:

```js
ud.forms.signup.validating
```

may be `true`.

The individual field also exposes:

```js
ud.forms.signup.getField("email").validating
```

when accessed through the controller API.

This makes it possible to distinguish a field that is invalid from one that is still being checked.

For example:

```html
<p @show="ud.forms.signup.validating">
  Checking your information…
</p>
```

For field-specific UI, use a computed value rather than calling `getField()` directly from a reactive template expression.

---

## Async Validation and Triggers

Asynchronous validators work with every validation trigger.

### `live`

```html
<input
  name="username"
  @validate="required uniqueUsername"
  @trigger="live"
/>
```

Validation can start on every relevant input/change event. Each new cycle supersedes the previous one.

This is useful for availability checks, but remote requests should generally be designed with cancellation and, where appropriate, debouncing at the application/service layer.

### `lazy`

```html
<input
  name="username"
  @validate="required uniqueUsername"
  @trigger="lazy"
/>
```

The validator runs when the control loses focus.

This can substantially reduce network traffic for expensive remote checks.

### `submit`

```html
<input
  name="username"
  @validate="required uniqueUsername"
  @trigger="submit"
/>
```

The validator waits until the form is submitted.

On full-form validation, the field participates regardless of whether its interactive trigger is `live`, `lazy`, or `submit`.

See [Form Submission](./submission.md).

---

## Multiple Async Validators

Validators on one field always execute in declaration order and stop at the first failure:

```html
<input
  name="email"
  @validate="required email uniqueEmail"
/>
```

The runtime effectively performs:

```text
required
   │
   ├── failure → stop
   │
   └── success
         │
         ▼
       email
         │
         ├── failure → stop
         │
         └── success
               │
               ▼
          uniqueEmail
```

If `uniqueEmail` is asynchronous, the field remains validating until that validator settles.

Form-level `parallel` mode does **not** make these validators run concurrently. Parallel mode coordinates different fields; validators within one field remain sequential.

---

## Async Validation with Sequential Forms

For:

```html
<form @form="signup sequential" @submit="signup">
```

different fields are validated one after another during full-form validation.

If the first field has an asynchronous validator:

```html
<form @form="signup sequential" @submit="signup">
  <input
    name="email"
    @validate="required uniqueEmail"
  />

  <input
    name="username"
    @validate="required uniqueUsername"
  />
</form>
```

the runtime waits for the email field's validation cycle before starting the username field.

If email fails, later fields are not validated in that submit cycle.

This is useful when:

- early exit is valuable;
- later checks are expensive;
- validation order has UX significance.

---

## Async Validation with Parallel Forms

For:

```html
<form @form="signup parallel" @submit="signup">
```

different fields can validate concurrently:

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
</form>
```

Both remote checks can start without waiting for the other.

The form waits for the complete validation pass before deciding whether submission may proceed.

If several fields fail, their errors can be available together:

```js
ud.forms.signup.errors.email
ud.forms.signup.errors.username
```

The first invalid field in registration order receives focus.

---

## Overlapping Validation Cycles

A field can have multiple validation cycles over its lifetime.

For example:

```text
cycle 1: "alice"
   │
   ├── request A starts
   │
cycle 2: "alice1"
   │
   ├── request A becomes obsolete
   └── request B starts
```

The important invariant is:

> Only the current validation cycle may update the field's current validation result.

Therefore, even if request A eventually resolves after request B, its result must not overwrite the result produced for `"alice1"`.

This is particularly important with:

- `@trigger="live"`
- slow APIs
- inconsistent network latency
- asynchronous validators that cannot be physically cancelled

Cancellation reduces unnecessary work; validation-cycle tracking provides the stale-result safety.

---

## Async Validation and Form Submission

Submission waits for asynchronous validation.

```js
methods: {
  async signup({ formData, controller }) {
    await api.signup(Object.fromEntries(formData));
    controller.reset();
  },

  async uniqueEmail(value, ctx) {
    const response = await fetch(
      `/api/users/check-email?email=${encodeURIComponent(value)}`,
      { signal: ctx.signal }
    );

    const { available } = await response.json();

    return available
      ? true
      : "Email is already registered";
  },
}
```

During submit:

```text
submit
  │
  ▼
start validation
  │
  ├── async validator pending
  │
  ▼
wait for validation
  │
  ├── invalid → focus first invalid field
  │
  └── valid → invoke submit handler
```

The submit handler is not called until all required validation work for the submit pass has completed successfully.

---

## Async Validation Errors

There are two different kinds of errors to distinguish.

### Validation failure

A validator returns a message:

```js
return "Email is already registered";
```

This becomes the field's validation error:

```js
ud.forms.signup.errors.email
```

### Validator execution failure

The asynchronous operation itself throws or rejects:

```js
const response = await fetch(url);
```

If the request fails unexpectedly, handle that condition explicitly when appropriate:

```js
async uniqueEmail(value, ctx) {
  try {
    const response = await fetch(url, {
      signal: ctx.signal,
    });

    if (!response.ok) {
      return "Unable to verify email";
    }

    const { available } = await response.json();

    return available
      ? true
      : "Email is already registered";
  } catch (error) {
    if (ctx.signal.aborted) {
      return true;
    }

    return "Unable to verify email";
  }
}
```

Do not expose raw network or implementation errors to users as validation messages.

---

## Avoiding Race Conditions

A common incorrect pattern is to maintain your own global request state:

```js
// Avoid coupling all email validations to one shared request.
let currentRequest;

async uniqueEmail(value) {
  currentRequest?.abort();

  const controller = new AbortController();
  currentRequest = controller;

  const response = await fetch(url, {
    signal: controller.signal,
  });

  // ...
}
```

This unnecessarily moves lifecycle management outside the field validation system and can become problematic when multiple form instances exist.

Prefer the validation context:

```js
async uniqueEmail(value, ctx) {
  const response = await fetch(url, {
    signal: ctx.signal,
  });

  // ...
}
```

Each validation cycle receives its own cancellation context.

---

## Practical Example

```js
import { createComponent, html, render } from "udodi";

const SignupForm = createComponent({
  name: "SignupForm",

  state() {
    return {
      email: "",
      username: "",
    };
  },

  methods: {
    required(value) {
      return value?.trim() ? true : "Required";
    },

    async uniqueEmail(value, ctx) {
      if (!value) return true;

      try {
        const response = await fetch(
          `/api/users/check-email?email=${encodeURIComponent(value)}`,
          { signal: ctx.signal }
        );

        if (!response.ok) {
          return "Unable to verify email";
        }

        const { available } = await response.json();

        return available
          ? true
          : "Email is already registered";
      } catch (error) {
        if (ctx.signal.aborted) return true;

        return "Unable to verify email";
      }
    },

    async uniqueUsername(value, ctx) {
      if (!value) return true;

      try {
        const response = await fetch(
          `/api/users/check-username?username=${encodeURIComponent(value)}`,
          { signal: ctx.signal }
        );

        if (!response.ok) {
          return "Unable to verify username";
        }

        const { available } = await response.json();

        return available
          ? true
          : "Username is already taken";
      } catch (error) {
        if (ctx.signal.aborted) return true;

        return "Unable to verify username";
      }
    },

    async signup({ formData, controller }) {
      await api.signup(Object.fromEntries(formData));
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
          @validate="required uniqueEmail"
          @trigger="lazy"
        />

        <span @text="ud.forms.signup.errors.email"></span>
      </label>

      <label>
        Username

        <input
          name="username"
          @bind="username"
          @validate="required uniqueUsername"
          @trigger="lazy"
        />

        <span @text="ud.forms.signup.errors.username"></span>
      </label>

      <p @show="ud.forms.signup.validating">
        Checking availability…
      </p>

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

With `parallel` mode, the email and username checks can execute concurrently during submit. With `lazy`, they also run independently when their respective controls lose focus.

---

## Cancellation and Component Cleanup

Validation belongs to the form field's lifecycle.

When a field is cleaned up, its active asynchronous validation is no longer allowed to update the removed field. In-flight validation work associated with the field is aborted as part of cleanup.

This matters for dynamic forms:

```html
<form @form="profile">
  <input
    name="username"
    @validate="uniqueUsername"
  />
</form>
```

If the control is removed while a remote validator is pending, the old validation must not update a field that no longer exists.

You therefore do not need to manually unregister validators or cancel a field's validation from application code.

---

## Recommendations

For production asynchronous validators:

1. **Always use `ctx.signal`** with APIs that support `AbortSignal`.
2. **Treat abort as cancellation, not a validation failure.**
3. **Do not maintain a global `AbortController` per validator.**
4. **Keep validators focused on validation**, rather than mutating application state.
5. **Use `lazy` for expensive remote checks** when validating on every keystroke is unnecessary.
6. **Use `parallel` form mode** when independent remote checks should run concurrently.
7. **Use `sequential` mode** when early failure should prevent expensive later checks.
8. **Return user-facing validation messages**, not raw transport or exception messages.
9. **Let the runtime manage validation-cycle lifetime and stale-result protection.**

---

## Common Mistakes

| Mistake | Result |
| --- | --- |
| Ignoring `ctx.signal` for `fetch` | Superseded network requests may continue consuming resources |
| Treating an abort as a validation failure | Obsolete validation can produce misleading UI |
| Using a shared/global `AbortController` | Different form instances or fields can interfere with one another |
| Assuming `parallel` makes validators on one field concurrent | It does not; validators within a field remain sequential |
| Assuming `@trigger="submit"` is the only validation run during submit | All registered fields participate in full-form submit validation |
| Updating component state from stale async results | Can create application-level race conditions |
| Showing raw request errors to users | Produces poor and potentially unsafe validation messages |

---

## Next Steps

| Goal | Guide |
| --- | --- |
| Validator syntax and triggers | [Validation](./validation.md) |
| Sequential vs parallel field scheduling | [Sequential and Parallel Validation](./sequential-parallel.md) |
| Submit lifecycle and async handlers | [Form Submission](./submission.md) |
| Controller state and helpers | [Form Controllers](./controllers.md) |
| Field registration and state | [Working with Fields](./fields.md) |

For registering the form itself, see [Creating a Form](./creating.md). For the overall architecture, see [Forms Overview](./overview.md).
