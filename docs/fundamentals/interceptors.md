# Interceptors

Interceptors run **before a root-level state assignment is committed**. They can transform the incoming value or cancel the write by returning `undefined`.

They are declared under the `interceptors` option of `createComponent()` and are passed to the component's shallow reactive state store.

An interceptor is associated with a **root state key**. It runs when that key is assigned through the reactive state path, including assignments made through the public component context.

```js
import { createComponent, html, render } from "udodi";

const Counter = createComponent({
  name: "Counter",

  state() {
    return {
      count: 0,
    };
  },

  interceptors: {
    count(value) {
      // Keep count non-negative.
      return Math.max(0, value);
    },
  },

  methods: {
    decrement() {
      this.count--;
    },
  },

  template: () => html`
    <main>
      <p>Count: <span @text="count"></span></p>
      <button @on="click=decrement">-</button>
    </main>
  `,
});

render(Counter(), "#app");
```

When `decrement()` assigns `-1` to `count`, the interceptor changes the value to `0` before it is committed.

Interceptors are therefore useful for **normalization, clamping, validation, and enforcing the shape of state writes**.

---

## Defining Interceptors

Interceptors are declared as functions keyed by root-level state names:

```js
interceptors: {
  count(value) {
    return Math.max(0, value);
  },

  coupon(value) {
    return String(value).trim().toUpperCase();
  },
},
```

The interceptor receives the value being assigned:

```js
this.count = -5;
```

The interceptor receives:

```js
-5
```

and its return value becomes the value that is committed.

An interceptor does not receive the previous value as an argument. If the previous value is needed, it can be read from the component context:

```js
interceptors: {
  count(value) {
    console.log("previous:", this.count);
    return Math.max(0, value);
  },
},
```

However, prefer keeping interceptors focused on transforming or validating the incoming value rather than performing unrelated side effects.

---

## Transforming a Value

Return a value to replace the original assignment:

```js
interceptors: {
  coupon(value) {
    return String(value).trim().toUpperCase();
  },

  count(value) {
    return Math.max(0, Number(value) || 0);
  },
},
```

Assignments then pass through the interceptor:

```js
this.coupon = " save20 ";
this.count = -5;
```

The resulting state is:

```js
this.coupon; // "SAVE20"
this.count;  // 0
```

The interceptor therefore sits between the attempted assignment and the committed state value:

```text
incoming value
      │
      ▼
  interceptor
      │
      ▼
transformed value
      │
      ▼
 reactive state
```

The transformed value is what the reactive signal and backing state object receive.

---

## Cancelling a Write

Return `undefined` to cancel the assignment.

```js
interceptors: {
  phoneNumber(value) {
    const normalized = String(value).replace(/\D/g, "");

    if (value !== normalized) {
      return undefined;
    }

    return value;
  },
},
```

Then:

```js
this.phoneNumber = "5551234";
```

commits normally.

But:

```js
this.phoneNumber = "555-1234";
```

is cancelled and the previous value remains unchanged.

There is no separate `reject()` or `cancel()` API.

**Returning `undefined` is the cancellation mechanism.**

The reactive `commit()` function checks the interceptor result and immediately returns without updating the signal or backing state when the result is `undefined`.

---

## Transform vs Cancel

These two behaviors are deliberately distinct:

### Transform

Return the value that should be stored:

```js
interceptors: {
  count(value) {
    return Math.max(0, Number(value));
  },
},
```

```js
this.count = -5;
// stored value → 0
```

### Cancel

Return `undefined`:

```js
interceptors: {
  count(value) {
    if (!Number.isFinite(value)) {
      return undefined;
    }

    return value;
  },
},
```

```js
this.count = 10;    // committed
this.count = "abc"; // cancelled
```

Cancellation leaves the existing state value untouched.

---

## When Interceptors Run

Interceptors execute as part of the reactive state's root-property write path.

Conceptually:

```text
this.count = 5
      │
      ▼
public component context
      │
      ▼
reactive state proxy
      │
      ▼
root state signal exists?
      │
      ▼
commit(prop, value, ...)
      │
      ▼
interceptor(value)
      │
      ├───────────────┐
      │               │
  undefined       nextValue
      │               │
      ▼               ▼
   cancel       update signal
                      │
                      ▼
                update state
                      │
                      ▼
                notify dependents
```

The reactive implementation invokes `commit()` for properties that have an existing reactive signal. The signal is then updated with the interceptor's returned value, and the backing target is synchronized with that value.

Typical sources of root-level assignments include:

```js
this.count = 5;
```

```js
this.count++;
```

```js
this.user = {
  ...this.user,
  name: "Grace",
};
```

and root-level writes produced by two-way bindings such as `@bind`.

Because those assignments ultimately pass through the component's reactive state proxy, the appropriate interceptor is applied.

---

## When Interceptors Do Not Run

### Nested In-Place Mutation

Interceptors operate on **root assignments**, not nested property mutations.

This does not invoke an interceptor for `user`:

```js
this.user.name = "Grace";
```

The `user` root reference has not been assigned.

If dependents need to be notified after the nested mutation, use:

```js
touch(this, "user");
```

`touch()` triggers the existing signal directly. It does **not** call the interceptor.

Therefore:

```js
this.user.name = "Grace";
touch(this, "user");
```

means:

```text
nested mutation
      │
      ▼
touch("user")
      │
      ▼
notify dependents
```

not:

```text
nested mutation
      │
      ▼
user interceptor
```

This distinction is important when an interceptor is responsible for normalization or validation.

---

## Initial State Is Not Intercepted

Interceptors do not process the initial result of `state()` field-by-field.

For example:

```js
const Counter = createComponent({
  name: "Counter",

  state() {
    return {
      count: -10,
    };
  },

  interceptors: {
    count(value) {
      return Math.max(0, value);
    },
  },
});
```

The initial `count` is installed directly into the reactive signal.

The interceptor applies to **subsequent assignments**:

```js
this.count = -20;
```

which is then transformed to:

```js
0
```

The reactive implementation initializes its signals directly from the `initialState` object rather than passing those values through `commit()`.

Therefore, if initial state must satisfy the same invariant, initialize it correctly in `state()`:

```js
state() {
  return {
    count: 0,
  };
},
```

Use the interceptor to enforce the invariant on later writes.

---

## Interceptors Apply to Root State Keys

Interceptors correspond to state properties.

For example:

```js
state() {
  return {
    count: 0,
    coupon: "",
  };
},

interceptors: {
  count(value) {
    return Math.max(0, value);
  },

  coupon(value) {
    return String(value).trim().toUpperCase();
  },
},
```

The `count` interceptor applies to writes to:

```js
this.count = value;
```

and the `coupon` interceptor applies to:

```js
this.coupon = value;
```

There is no interceptor pipeline shared between them.

A key without an interceptor is simply written normally.

```js
state() {
  return {
    count: 0,
    coupon: "",
    enabled: false,
  };
},

interceptors: {
  count(value) {
    return Math.max(0, value);
  },

  coupon(value) {
    return String(value).toUpperCase();
  },

  // No interceptor for enabled.
},
```

`enabled` is assigned without an interceptor.

---

## Unknown Interceptor Keys

An interceptor configuration does not create a new state property.

For example:

```js
state() {
  return {
    count: 0,
  };
},

interceptors: {
  count(value) {
    return Math.max(0, value);
  },

  unknown(value) {
    return value;
  },
},
```

`unknown` does not become:

```js
this.unknown
```

and there is no reactive signal for it.

The reactive store only invokes an interceptor when the assigned property already has a reactive signal.

This means interceptors should be declared for keys that exist in the component's root state.

---

## Root Replacement and Nested Data

Because interceptors operate at the root level, replacing an object causes the new object to pass through the interceptor:

```js
state() {
  return {
    user: {
      name: "Ada",
      role: "admin",
    },
  };
},

interceptors: {
  user(value) {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return undefined;
    }

    return {
      ...value,
      name: String(value.name ?? "").trim(),
    };
  },
},
```

Now:

```js
this.user = {
  name: " Grace ",
  role: "admin",
};
```

is normalized before being committed:

```js
this.user;
// {
//   name: "Grace",
//   role: "admin"
// }
```

This is useful when the invariant applies to the **whole root value**.

For an in-place nested update:

```js
this.user.name = "Grace";
```

the interceptor is not invoked.

If the nested mutation is trusted and only notification is required:

```js
this.user.name = "Grace";
touch(this, "user");
```

Use root replacement when the value needs to pass through normalization or validation. Use `touch()` when the root value is intentionally mutated in place and only reactive notification is required.

See [State](./state.md) and [Using `touch()`](../reactivity/touch.md).

---

## Interceptors and Reactivity

After an interceptor returns a value, the reactive signal receives that value:

```js
signal.set(nextValue);
```

The backing state object is then synchronized with the same value.

The signal itself uses `Object.is()` to determine whether the stored value actually changed.

Therefore, an interceptor can successfully transform an assignment without causing a reactive update if the resulting value is identical to the previous value:

```js
interceptors: {
  count(value) {
    return Math.max(0, value);
  },
},
```

If the current value is already `0`:

```js
this.count = -10;
```

becomes:

```text
-10
  │
  ▼
interceptor
  │
  ▼
  0
  │
  ▼
Object.is(previous 0, next 0)
  │
  ▼
no reactive notification
```

This is an important distinction:

> **An interceptor can transform a write without necessarily causing dependents to re-run.**

If the transformed result is `Object.is()`-equal to the current value, the signal does not notify its subscribers.

---

## Interceptors and Watchers

Interceptors operate **before** the state value is committed.

Watchers operate **after** the reactive state changes.

For example:

```js
interceptors: {
  count(value) {
    return Math.max(0, value);
  },
},

watch: {
  countChange: {
    deps: ["count"],

    handler(newValues, oldValues) {
      console.log(
        oldValues.count,
        "→",
        newValues.count,
      );
    },
  },
},
```

If:

```js
this.count = -5;
```

the interceptor first converts the attempted value to `0`.

The watcher observes the resulting state transition, not the raw attempted value:

```text
this.count = -5
      │
      ▼
interceptor
      │
      ▼
      0
      │
      ▼
reactive signal
      │
      ▼
watcher
```

If the current value was already `0`, the interceptor still runs, but the watcher does not run because the signal does not detect a change.

See [Watchers](./watch.md).

---

## Interceptors and Computed Values

Computed values consume the state produced by the interceptor.

```js
state() {
  return {
    count: 0,
  };
},

interceptors: {
  count(value) {
    return Math.max(0, value);
  },
},

computed: {
  doubled(ctx) {
    return ctx.count * 2;
  },
},
```

When:

```js
this.count = -5;
```

the computed value sees the committed value:

```js
this.doubled;
// 0
```

It does not see the raw `-5` assignment.

The interceptor therefore establishes the value that becomes part of the reactive state graph.

See [Computed Values](./computed.md).

---

## Interceptors and Methods

Methods are often the source of state writes:

```js
methods: {
  decrement() {
    this.count--;
  },
},
```

The method does not need to manually invoke the interceptor.

The assignment:

```js
this.count--;
```

passes through the reactive state proxy and therefore through the configured `count` interceptor.

This keeps normalization and validation centralized:

```js
interceptors: {
  count(value) {
    return Math.max(0, value);
  },
},

methods: {
  decrement() {
    this.count--;
  },

  setCount(value) {
    this.count = value;
  },
},
```

Both methods use the same state-write rule.

---

## Practical Patterns

### Clamp a Number

```js
interceptors: {
  quantity(value) {
    const n = Number(value);

    if (!Number.isFinite(n)) {
      return undefined;
    }

    return Math.min(99, Math.max(1, n));
  },
},
```

This accepts numeric input, rejects invalid numbers, and keeps valid values within the allowed range.

---

### Normalize a String

```js
interceptors: {
  email(value) {
    return String(value).trim().toLowerCase();
  },
},
```

```js
this.email = "  USER@EXAMPLE.COM  ";

this.email;
// "user@example.com"
```

---

### Allow-List Values

```js
interceptors: {
  status(value) {
    return value === "idle" ||
      value === "loading" ||
      value === "done"
      ? value
      : undefined;
  },
},
```

Invalid values are cancelled rather than committed.

---

### Normalize Digits

```js
interceptors: {
  zip(value) {
    return String(value).replace(/\D/g, "");
  },
},
```

Unlike a rejecting interceptor, this one always returns a value, so the assignment is normalized and committed.

```js
this.zip = "12-345";

this.zip;
// "12345"
```

---

### Normalize a Root Object

```js
interceptors: {
  user(value) {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return undefined;
    }

    return {
      ...value,
      name: String(value.name ?? "").trim(),
    };
  },
},
```

This is preferable to trying to intercept individual nested properties because the interceptor receives the complete root value being assigned.

---

## Avoid Side Effects in Interceptors

Interceptors are primarily intended to **shape a state write**.

Prefer:

```js
interceptors: {
  count(value) {
    return Math.max(0, value);
  },
},
```

over using the interceptor to perform unrelated work:

```js
interceptors: {
  count(value) {
    analytics.track("count-write", value);
    saveToServer(value);
    return value;
  },
},
```

If another part of the application needs to react to the committed state, use a watcher:

```js
watch: {
  countChange: {
    deps: ["count"],

    handler(newValues) {
      analytics.track(
        "count-changed",
        newValues.count,
      );
    },
  },
},
```

This separates the responsibilities:

```text
Interceptor → shape the state write
Watcher     → react to the state change
Method      → perform explicit behavior
```

See [Watchers](./watch.md) and [Methods](./methods.md).

---

## Interceptors vs Watchers vs Methods

|                     | Interceptors               | Watchers                   | Methods                               |
| ------------------- | -------------------------- | -------------------------- | ------------------------------------- |
| Primary purpose     | Shape a state write        | React to state changes     | Perform explicit behavior             |
| Timing              | Before commit              | After a dependency changes | When called                           |
| Receives            | Incoming value             | `newValues`, `oldValues`   | Explicit arguments                    |
| Can transform state | Yes                        | No                         | Yes, by assigning state               |
| Can cancel a write  | Yes, with `undefined`      | No                         | Indirectly, by choosing not to assign |
| Nested mutation     | Not invoked                | Requires root notification | Can mutate nested state               |
| Typical use         | Normalize, clamp, validate | Persist, sync, log         | Events, actions, helpers              |

For example:

```js
interceptors: {
  count(value) {
    return Math.max(0, value);
  },
},

watch: {
  countChange: {
    deps: ["count"],

    handler(newValues) {
      localStorage.setItem(
        "count",
        String(newValues.count),
      );
    },
  },
},

methods: {
  decrement() {
    this.count--;
  },
},
```

The responsibilities are clear:

```text
decrement()
    │
    ▼
state write
    │
    ▼
interceptor
    │
    ├── cancel
    │
    └── transform
          │
          ▼
    reactive state
          │
          ▼
       watcher
```

---

## Interceptors and `touch()`

`touch()` and interceptors serve fundamentally different purposes.

An interceptor modifies an **incoming root assignment**:

```js
this.user = nextUser;
```

`touch()` notifies dependents after an **in-place mutation**:

```js
this.user.name = "Grace";
touch(this, "user");
```

The latter does not pass the value through:

```js
interceptors.user(...)
```

The reactive implementation's `touch()` function obtains the signal trigger and invokes it directly. It does not call `commit()` and therefore does not invoke interceptors.

Use:

```js
this.user = {
  ...this.user,
  name: "Grace",
};
```

when the new root value must pass through the interceptor.

Use:

```js
this.user.name = "Grace";
touch(this, "user");
```

when the nested mutation is already trusted and only notification is needed.

---

## Binding and Interceptors

Two-way bindings that assign to a root state property use the same reactive write path as ordinary assignments.

For example:

```js
state() {
  return {
    coupon: "",
  };
},

interceptors: {
  coupon(value) {
    return String(value).trim().toUpperCase();
  },
},

template: () => html`
  <input @bind="coupon" />
  <p @text="coupon"></p>
`,
```

When the binding writes a new value to `coupon`, the assignment goes through the reactive state proxy and the `coupon` interceptor.

Therefore, input such as:

```text
save20
```

is committed as:

```text
SAVE20
```

The interceptor remains the single place responsible for the state invariant rather than requiring the binding itself to perform normalization.

---

## Constraints

| Constraint               | Behavior                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| Root state writes        | Interceptors run before an initialized reactive state key is committed   |
| Unknown interceptor keys | Do not create state properties or reactive signals                       |
| Nested mutation          | Does not invoke the root interceptor                                     |
| `touch()`                | Notifies the root signal without invoking the interceptor                |
| Cancellation             | Returning `undefined` cancels the write                                  |
| Transformation           | Any other returned value becomes the committed value                     |
| Initial state            | `state()` values are installed without interceptor processing            |
| Reactive notification    | Uses `Object.is()` through the underlying signal                         |
| Equal transformed value  | No dependent notification when the committed value is `Object.is`-equal  |
| Computed values          | See the intercepted/committed state                                      |
| Watchers                 | React to the resulting committed state change                            |
| Methods                  | Root assignments made by methods automatically pass through interceptors |

---

## Minimal Example

```js
import { createComponent, html, render } from "udodi";

const CouponField = createComponent({
  name: "CouponField",

  state() {
    return {
      coupon: "",
    };
  },

  interceptors: {
    coupon(value) {
      return String(value).trim().toUpperCase();
    },
  },

  template: () => html`
    <label>
      Coupon
      <input @bind="coupon" />
    </label>

    <p>
      Applied:
      <span @text="coupon"></span>
    </p>
  `,
});

render(CouponField(), "#app");
```

Typing:

```text
save20
```

causes the binding to attempt the root assignment:

```js
this.coupon = "save20";
```

The interceptor transforms it:

```js
"save20" → "SAVE20"
```

and `"SAVE20"` becomes the committed reactive state value.

---

## Next Steps

* [Components](./components.md) — the component model and root-level state
* [State](./state.md) — reactive state and shallow updates
* [Watchers](./watch.md) — side effects after state changes
* [Methods](./methods.md) — explicit actions that perform state writes
* [Computed Values](./computed.md) — derived values from reactive state
* [Using `touch()`](../reactivity/touch.md) — notifying after nested mutations
* [Reactivity Overview](../reactivity/overview.md) — signals, effects, and the reactive write path
