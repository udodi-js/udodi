# Quick Start

This guide walks you through building a small reactive application with Udodi.

You will learn how to:

* Create Udodi component
* Define reactive state
* Create computed values
* Define methods
* Watch reactive state
* Use component interceptors
* Work with component lifecycle hooks
* Define component-scoped styles
* Build declarative templates
* Handle DOM events
* Mount the application

By the end of this guide, you will have a small counter application that demonstrates the basic structure of Udodi component.

---

## Installation

If you have not installed Udodi yet, see the [Installation](./installation.md) guide.


## Create a Component

Udodi application starts with a component.

Create an `app.js` file:

```js
import { createComponent, css, html, render } from "udodi";

const Counter = createComponent({
  name: "Counter",

  state() {
    return {
      count: 0,
    };
  },

  computed: {
    doubled(ctx) {
      return ctx.count * 2;
    },
  },

  watch: {
    countChange: {
      deps: ["count"],
      handler(newValues, oldValues) {
        console.log(
          `Count changed from ${oldValues.count} to ${newValues.count}`
        );
      },
    },
  },

  methods: {
    increment() {
      this.count++;
    },

    decrement() {
      this.count--;
    },
  },

  onMount(root, ctx) {
    console.log("Counter component mounted");
  },

  onUnmount(root, ctx) {
    console.log("Counter component unmounted");
  },

  // Interceptors run before a root state assignment is committed.
  // Return a transformed value, or `undefined` to cancel the update.
  interceptors: {
    count(value) {
      // Keep count non-negative.
      return Math.max(0, value);
    },
  },

  style: css`
    .counter {
      max-width: 320px;
      margin: 2rem auto;
      padding: 2rem;
      text-align: center;
      border: 1px solid #ddd;
      border-radius: 8px;
    }

    button {
      margin: 0 0.25rem;
      padding: 0.5rem 1rem;
    }
  `,

  template: () => html`
    <main class="counter">
      <h1>Counter</h1>

      <p>Count: <span @text="count"></span></p>
      <p>Doubled: <span @text="doubled"></span></p>

      <button @on="click=decrement">-</button>
      <button @on="click=increment">+</button>
    </main>
  `,
});

render(Counter(), "#app");
```

> **Note:** The `css` and `html` helpers are pass-through tagged templates. They do not change the runtime behavior of your styles or templates, but can provide better syntax highlighting and editor support.

This component demonstrates the main options available when defining Udodi component:

| Option         | Purpose                                                             |
| -------------- | ------------------------------------------------------------------- |
| `name`         | Optional label used by tooling and error messages                   |
| `state`        | Function that returns the component's reactive state object         |
| `computed`     | Values derived from reactive state                                  |
| `watch`        | Side effects that respond to top-level state changes                |
| `methods`      | Reusable behavior, including event handlers, helpers, and resolvers |
| `onMount`      | Runs after the component is mounted to the DOM                      |
| `onUnmount`    | Runs before the component is cleaned up                             |
| `interceptors` | Transform or cancel root state assignments before they commit       |
| `style`        | CSS scoped to the component                                         |
| `template`     | Declarative HTML structure, provided as a string or function        |

When `count` changes, Udodi updates the parts of the DOM that depend on it, including the computed `doubled` value.


## Understand the Component

### State

The `state` property must be a **function** that returns a fresh object for each component instance:

```js
state() {
  return {
    count: 0,
  };
},
```

Returning the same object for multiple component instances will trigger a warning.

Udodi's component state is shallow and path-based. Nested objects are **not** deeply proxied. Only the top-level state keys are directly reactive.

Update state through the component context:

```js
methods: {
  increment() {
    this.count++;
  },
},
```

Udodi tracks the change and updates the parts of the interface that depend on `count`.

Learn more in [State](./fundamentals/state.md).


### Computed Values

The `computed` property defines values derived from reactive state. Each computed function receives the component context:

```js
computed: {
  doubled(ctx) {
    return ctx.count * 2;
  },
},
```

The `doubled` value automatically updates when `count` changes.

Prefer computed values for anything that can be derived from existing reactive state.

Learn more in [Computed Values](./fundamentals/computed.md).


### Methods

The `methods` property holds reusable component behavior. Methods are bound to the component context, so you can read and write state with `this`:

```js
methods: {
  increment() {
    this.count++;
  },

  decrement() {
    this.count--;
  },
},
```

Reference them from the template with `@on`:

```html
<button @on="click=decrement">-</button>
<button @on="click=increment">+</button>
```

Udodi's template DSL does not allow arbitrary JavaScript expressions inside directives. Directives use a minimal DSL of paths, resolver calls, and literals.

Learn more in [Methods](./fundamentals/methods.md) and [Template DSL](./templates/dsl.md).


### Watchers

The `watch` property lets a component respond to top-level state changes. Each watcher declares its dependencies and a handler:

```js
watch: {
  countChange: {
    deps: ["count"],
    handler(newValues, oldValues) {
      console.log(
        `Count changed from ${oldValues.count} to ${newValues.count}`
      );
    },
  },
},
```

* `deps` lists the top-level state keys to observe.
* `handler` receives maps of new and old values for those keys.
* Watchers skip their initial run and fire only after later changes.

Watchers are useful for side effects such as:

* Synchronizing state with an external system
* Persisting changes
* Triggering asynchronous work
* Logging changes

For values derived from reactive state, prefer `computed` instead.

Learn more in [Watchers](./fundamentals/watch.md).


### Component Lifecycle

Udodi components can define lifecycle hooks that run when the component is mounted and unmounted:

```js
onMount(root, ctx) {
  console.log("Counter component mounted");
},

onUnmount(root, ctx) {
  console.log("Counter component unmounted");
},
```

* `onMount(root, ctx)` runs after the component has been bound to the DOM.
* `onUnmount(root, ctx)` runs before the component is cleaned up.
* `root` refers to the component's root DOM element.
* `ctx` provides access to the component context.

Typical uses include:

* Initializing subscriptions
* Registering external event listeners
* Starting timers
* Connecting to external resources
* Cleaning up subscriptions, listeners, and timers

You can also register cleanup callbacks with `ctx.cleanup(fn)` from `onMount`. Udodi runs those automatically during unmount, along with directive effects, event listeners, and watchers.

Learn more in [Lifecycle](./fundamentals/lifecycle.md).


### Interceptors

Interceptors run **before** a root state value is committed. They can transform the incoming value or cancel the update by returning `undefined`:

```js
interceptors: {
  count(value) {
    // Keep count non-negative.
    return Math.max(0, value);
  },
},
```

For example, multiple state properties can have their own interception logic:

```js
interceptors: {
  coupon(value) {
    return value.toUpperCase();
  },

  phoneNumber(value) {
    const onlyNumbers = value.replace(/\D/g, "");

    return value === onlyNumbers
      ? value
      : undefined; // Cancel invalid input.
  },
},
```

Interceptors are useful when state assignments need normalization, transformation, or validation before the new value is committed.

Learn more in [Interceptors](./fundamentals/interceptor.md).


### Component Styles

The `style` property defines CSS for the component. Udodi scopes component styles so they remain scoped to the component:

```js
style: css`
  .counter {
    max-width: 320px;
    margin: 2rem auto;
    padding: 2rem;
    text-align: center;
    border: 1px solid #ddd;
    border-radius: 8px;
  }

  button {
    margin: 0 0.25rem;
    padding: 0.5rem 1rem;
  }
`,
```

Markup and styles can stay together in the same component definition.

The optional `css` tagged template is a pass-through helper that provides editor syntax highlighting without changing how the CSS is processed by Udodi.

Learn more in [Component Styles](./fundamentals/styles.md) and [CSS Scoping](./advanced/css-scoping.md).


## Define the Template

The `template` property defines the component's HTML. It may be a string or a function that returns a string.

The rendered template must have **exactly one root element**.

```js
template: () => html`
  <main class="counter">
    <h1>Counter</h1>

    <p>Count: <span @text="count"></span></p>
    <p>Doubled: <span @text="doubled"></span></p>

    <button @on="click=decrement">-</button>
    <button @on="click=increment">+</button>
  </main>
`,
```

In this example:

| Directive               | Meaning                                                  |
| ----------------------- | -------------------------------------------------------- |
| `@text="count"`         | Binds the element's text content to reactive `count`     |
| `@text="doubled"`       | Binds text content to the computed `doubled` value       |
| `@on="click=increment"` | Calls the `increment` method when the element is clicked |

The optional `html` tagged template is a pass-through helper intended primarily for editor syntax highlighting and future tooling.

Learn more in [Templates and Directives](./templates/) and [Template DSL](./templates/dsl.md).


## Mount the Application

Create an `index.html` file with a mount point:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Udodi Quick Start</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./app.js"></script>
</body>
</html>
```

Mount the component with `render`:

```js
render(Counter(), "#app");
// or:
render(Counter(), document.getElementById("app"));
```

`createComponent()` returns a component factory. Calling `Counter()` creates a component placeholder that `render` mounts into the target.

Your application is now running.

When you click **+**:

1. The `increment` method changes `count`.
2. Udodi detects the reactive state change.
3. The `@text="count"` binding updates.
4. The `doubled` computed value is recalculated.
5. The `@text="doubled"` binding updates.
6. The `countChange` watcher runs.

Updates are driven by reactive dependencies. Udodi does not re-render the entire component.


## The Complete Example

### `app.js`

```js
import { createComponent, css, html, render } from "udodi";

const Counter = createComponent({
  name: "Counter",

  state() {
    return {
      count: 0,
    };
  },

  computed: {
    doubled(ctx) {
      return ctx.count * 2;
    },
  },

  watch: {
    countChange: {
      deps: ["count"],
      handler(newValues, oldValues) {
        console.log(
          `Count changed from ${oldValues.count} to ${newValues.count}`
        );
      },
    },
  },

  methods: {
    increment() {
      this.count++;
    },

    decrement() {
      this.count--;
    },
  },

  onMount(root, ctx) {
    console.log("Counter component mounted");
  },

  onUnmount(root, ctx) {
    console.log("Counter component unmounted");
  },

  style: css`
    .counter {
      max-width: 320px;
      margin: 2rem auto;
      padding: 2rem;
      text-align: center;
      border: 1px solid #ddd;
      border-radius: 8px;
    }

    button {
      margin: 0 0.25rem;
      padding: 0.5rem 1rem;
    }
  `,

  template: () => html`
    <main class="counter">
      <h1>Counter</h1>

      <p>Count: <span @text="count"></span></p>
      <p>Doubled: <span @text="doubled"></span></p>

      <button @on="click=decrement">-</button>
      <button @on="click=increment">+</button>
    </main>
  `,
});

render(Counter(), "#app");
```

### `index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Udodi Quick Start</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./app.js"></script>
</body>
</html>
```


## What You Have Learned

This quick start introduced the core structure of Udodi component:

| Property       | Purpose                                     |
| -------------- | ------------------------------------------- |
| `state`        | Function returning reactive component state |
| `computed`     | Values derived from reactive state          |
| `watch`        | Side effects for top-level state changes    |
| `methods`      | Reusable behavior and event handlers        |
| `onMount`      | Runs after the component is mounted         |
| `onUnmount`    | Runs before the component is cleaned up     |
| `interceptors` | Transform or cancel root state assignments  |
| `style`        | CSS scoped to the component                 |
| `template`     | Declarative HTML and reactive bindings      |

You also used two Udodi directives:

| Directive | Purpose                                      |
| --------- | -------------------------------------------- |
| `@text`   | Updates an element's text content reactively |
| `@on`     | Connects DOM events to component methods     |

The basic component mental model is:

```text
Component
├── state()
├── computed
├── watch
├── methods
├── onMount
├── onUnmount
├── interceptors
├── style
└── template
```

Each property has a focused responsibility. Udodi's fine-grained reactive runtime coordinates them.

The template DSL intentionally avoids arbitrary JavaScript expressions. Templates use paths, resolver calls, and literals so the syntax remains predictable and CSP-friendly.


## Where to Go Next

### Learn Components

* [Components](./fundamentals/components.md)
* [State](./fundamentals/state.md)
* [Methods](./fundamentals/methods.md)
* [Computed Values](./fundamentals/computed.md)
* [Watchers](./fundamentals/watch.md)
* [Interceptors](./fundamentals/interceptor.md)
* [Lifecycle](./fundamentals/lifecycle.md)
* [Props](./fundamentals/props.md)
* [Context](./fundamentals/context.md)
* [Component Styles](./fundamentals/styles.md)

### Learn Reactivity

Start with the [Reactivity Overview](./reactivity/overview.md).

### Learn Templates

Start with the [Template Overview](./templates/overview.md).

### Build Forms

See the [Forms Overview](./forms/overview.md).

### Manage Application State

Explore [Udodi Store](./store/).

### Manage Asynchronous Data

Explore [Query Pool](./query-pool/).

### Build Modals and Dialogs

See the [Overlay system](./overlay/).

### Explore the API

When you need precise signatures, options, return values, and behavior, use the [API Reference](./api/).
