# Lifecycle

An Udodi component follows a managed lifecycle:

**create → initialize → mount → active → unmount → cleanup**

The runtime owns the component's reactive scopes, directive bindings, DOM listeners, root registration, and component-scoped cleanup. You can participate through `onMount`, `onUnmount`, and `ctx.cleanup(fn)`.

---

## Lifecycle Overview

```text
createComponent({ ... })
        │
        ▼
Component factory
        │
        │ Component(props) / render()
        ▼
Initialize instance
  • state()
  • reactive state store
  • interceptors
  • computed values
  • methods
  • props
  • watchers
        │
        ▼
Mount
  • create template DOM
  • require exactly one root element
  • resolve nested components
  • bind directives
  • register root
  • inject ctx.cleanup()
  • onMount(root, ctx)
        │
        ▼
Active
  • state updates
  • computed evaluation
  • watcher effects
  • DOM bindings
        │
        ▼
Unmount / removal
  • onUnmount(root, ctx)
  • dispose watcher/computed scopes
  • run mount-scope cleanups
  • dispose directive bindings/listeners
  • unregister root
  • remove DOM when explicitly requested
```

The exact internal ordering is an implementation detail. What matters to application code is that `onUnmount` is invoked during teardown and registered cleanup callbacks and reactive resources are subsequently disposed as part of the component's teardown.

---

## `onMount`

`onMount` runs after the component has been mounted and its DOM bindings have been established.

```js
const Example = createComponent({
  name: "Example",

  onMount(root, ctx) {
    console.log("mounted", root, ctx);
  },

  template: () => html`
    <div>Example</div>
  `,
});
```

| Argument | Meaning                                 |
| -------- | --------------------------------------- |
| `root`   | The component's single root DOM element |
| `ctx`    | The public component context            |

Typical uses include:

* Focusing an element through `ctx.refs`
* Starting timers or intervals
* Subscribing to external systems
* Measuring the mounted DOM
* Registering cleanup callbacks with `ctx.cleanup(fn)`

```js
onMount(root, ctx) {
  ctx.refs.input?.focus();

  const id = setInterval(() => {
    ctx.count++;
  }, 1000);

  ctx.cleanup(() => {
    clearInterval(id);
  });
},
```

`onMount` is optional.

---

## `onUnmount`

`onUnmount` is called when the component is being torn down.

```js
const Example = createComponent({
  name: "Example",

  onUnmount(root, ctx) {
    console.log("unmounting", root);
  },

  template: () => html`
    <div>Example</div>
  `,
});
```

Use `onUnmount` for lifecycle-specific teardown logic, such as notifying another part of an application or performing a final synchronous action.

For resources that need explicit disposal, prefer `ctx.cleanup(fn)` when the resource is created. This keeps acquisition and cleanup together:

```js
onMount(root, ctx) {
  const subscription = externalStore.subscribe(value => {
    ctx.value = value;
  });

  ctx.cleanup(() => {
    subscription.unsubscribe();
  });
},
```

Errors thrown during unmount cleanup are handled by the runtime so that one failing cleanup does not prevent the remaining teardown work from being attempted.

---

## `ctx.cleanup(fn)`

`ctx.cleanup(fn)` registers a callback in the component's **mount scope**.

It is injected into the public context during mounting, before `onMount` is called:

```js
onMount(root, ctx) {
  const timer = setInterval(() => {
    ctx.count++;
  }, 1000);

  ctx.cleanup(() => {
    clearInterval(timer);
  });
},
```

The callback is executed when the component's mount scope is disposed.

### Important characteristics

* It registers cleanup; it does not execute the callback immediately.
* Multiple cleanup callbacks can be registered.
* Cleanup callbacks are component-scoped.
* They are automatically run during unmount.
* They are also run if mounting fails after the mount scope has been established.
* You normally register them from `onMount` or code that runs after mount.

Do not treat `ctx.cleanup(fn)` as a lifecycle hook or as a function that returns a disposer. It is a way to add teardown work to the component's existing cleanup scope.

---

## Automatic Cleanup

Udodi manages several resources without requiring manual teardown.

| Resource                       | Cleanup                                      |
| ------------------------------ | -------------------------------------------- |
| Watcher effects                | Disposed with the component's watcher scope  |
| Computed effects               | Disposed with the component's computed scope |
| Directive effects              | Disposed with the mount scope                |
| DOM event listeners            | Removed with directive cleanup               |
| User `ctx.cleanup()` callbacks | Executed from the mount scope                |
| Root registration              | Removed from the root registry               |
| Nested components              | Their own component lifecycle is torn down   |

You therefore do **not** need to manually stop watchers, computed values, or directive effects.

For example, this watcher does not require an explicit `stop()`:

```js
watch: {
  countChange: {
    deps: ["count"],

    handler(newValues) {
      console.log(newValues.count);
    },
  },
},
```

Its reactive effect is associated with the component and is disposed automatically when the component is torn down.

---

## Watchers and Computed Values

Watchers and computed values are created as component-scoped reactive resources.

A watcher records its dependencies when the instance is initialized. Its handler does not run during the initial setup pass.

```js
watch: {
  countChange: {
    deps: ["count"],

    handler(newValues, oldValues) {
      console.log(oldValues.count, "→", newValues.count);
    },
  },
},
```

The handler receives **maps of dependency values**, not a single value:

```js
handler(newValues, oldValues) {
  console.log(newValues.count);
  console.log(oldValues.count);
}
```

When the component is unmounted, the watcher scope is disposed.

Computed values likewise belong to the component's computed scope and are cleaned up with the component.

See [Watchers](./watch.md) and [Computed Values](./computed.md).

---

## Mounting and the DOM

A component template must produce exactly one root element.

```js
// ❌ Invalid — multiple roots
template: () => html`
  <h1>Title</h1>
  <p>Body</p>
`,
```

```js
// ✅ Valid — one root
template: () => html`
  <div>
    <h1>Title</h1>
    <p>Body</p>
  </div>
`,
```

The root element is passed to lifecycle hooks:

```js
onMount(root, ctx) {
  root.classList.add("ready");
},

onUnmount(root, ctx) {
  console.log("removing", root);
},
```

Nested component placeholders are resolved as part of mounting. Child components therefore receive their own lifecycle and cleanup management.

---

## Explicit Unmount

When you control the component lifecycle, prefer explicit unmounting.

```js
import { render } from "udodi";

const instance = render(Counter(), "#app");

// Later:
instance.unmount();
```

The mounted instance provides the lifecycle boundary for the component.

Use explicit unmounting when the application knows that a component is no longer needed. This makes teardown intentional and predictable.

---

## DOM Removal

Udodi also observes registered component roots for removal from the document.

If a mounted component root is removed without explicitly calling its unmount operation, the runtime can detect the removal and perform the component's cleanup.

For example:

```js
const instance = render(Counter(), "#app");

// External code removes the component's DOM.
document.querySelector("#app").firstElementChild?.remove();
```

The root-removal observer allows Udodi to clean up component-scoped resources even when removal happened outside the component API.

Explicit unmounting is still preferable when application code controls the lifecycle.

---

## Cleanup During Mount Failure

Mounting can establish resources before the complete mount operation finishes. The runtime therefore associates mount-time resources with the component's mount scope.

If mounting fails after those resources have been registered, the mount scope is cleaned up rather than being left active.

This is particularly important for:

* Directive effects
* DOM listeners
* User `ctx.cleanup()` callbacks
* Other resources registered during mounting

Application code should therefore register external resource cleanup as soon as the resource is acquired.

---

## Lifecycle and State

State is created per component instance during initialization:

```js
const Counter = createComponent({
  name: "Counter",

  state() {
    return {
      count: 0,
    };
  },

  template: () => html`
    <button @text="count"></button>
  `,
});
```

Each call that creates an instance receives its own state.

State remains reactive while the instance is active. When the component is torn down, the reactive resources associated with the instance are disposed.

See [State](./state.md).

---

## Lifecycle and Interceptors

Interceptors become active for root-level state assignments while the component instance exists.

```js
interceptors: {
  count(value) {
    return Math.max(0, value);
  },
},
```

An interceptor is part of the state's root write path. It does not need a separate lifecycle cleanup.

Nested mutations and `touch()` do not invoke interceptors.

See [Interceptors](./interceptors.md).

---

## Lifecycle and Methods

Methods are available on the public component context during the instance lifecycle:

```js
methods: {
  increment() {
    this.count++;
  },
},
```

Methods do not themselves require lifecycle cleanup.

If a method creates an external resource that must survive only for the lifetime of the component, register its cleanup with `this.cleanup(fn)` when appropriate:

```js
methods: {
  startPolling() {
    const id = setInterval(() => {
      this.count++;
    }, 1000);

    this.cleanup(() => {
      clearInterval(id);
    });
  },
},
```

For resources that should begin automatically when mounted, `onMount` is usually the clearer place to create them.

---

## Lifecycle and Props

Props are established when the component instance is created and remain available through the public context while the instance is active.

```js
const Greeter = createComponent({
  name: "Greeter",

  template: () => html`
    <p>Hello, <span @text="userName"></span></p>
  `,
});

Greeter({
  userName: "Ada",
});
```

Reactive prop values remain connected while the instance is active. Their associated resources are disposed when the component is torn down.

See [Props](./props.md).

---

## A Complete Example

```js
import { createComponent, html, render } from "udodi";

const Clock = createComponent({
  name: "Clock",

  state() {
    return {
      now: new Date().toLocaleTimeString(),
    };
  },

  onMount(root, ctx) {
    const timer = setInterval(() => {
      ctx.now = new Date().toLocaleTimeString();
    }, 1000);

    ctx.cleanup(() => {
      clearInterval(timer);
      console.log("Clock timer cleaned up");
    });

    console.log("Clock mounted", root);
  },

  onUnmount(root) {
    console.log("Clock unmounting", root);
  },

  template: () => html`
    <p class="clock">
      <span @text="now"></span>
    </p>
  `,
});

const instance = render(Clock(), "#app");

// Later:
// instance.unmount();
```

The timer belongs to the component's mount scope. When the component is unmounted, the registered cleanup callback clears it automatically.

---

## Lifecycle Rules

| Rule                              | Behavior                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| Single template root              | Mount requires exactly one root element                                            |
| `onMount` is optional             | Runs after the component has been mounted and bindings established                 |
| `onUnmount` is optional           | Runs during component teardown                                                     |
| `ctx.cleanup(fn)`                 | Registers a callback with the component's mount scope                              |
| Cleanup is component-scoped       | Registered resources are disposed with the component                               |
| Watchers are automatic            | Watcher effects are disposed on teardown                                           |
| Computeds are automatic           | Computed scope is disposed on teardown                                             |
| Directive resources are automatic | Effects and listeners are cleaned up with the mount scope                          |
| Mount failure is cleaned up       | Established mount-scope resources are not left active                              |
| DOM removal is observed           | Registered roots can be cleaned up when removed externally                         |
| Explicit unmount is preferred     | Use the component/instance unmount API when lifecycle is under application control |

---

## Minimal Example

```js
import { createComponent, html, render } from "udodi";

const Banner = createComponent({
  name: "Banner",

  onMount(root, ctx) {
    root.classList.add("is-visible");

    ctx.cleanup(() => {
      root.classList.remove("is-visible");
    });
  },

  template: () => html`
    <div class="banner">Hello</div>
  `,
});

const instance = render(Banner(), "#app");

// Later:
// instance.unmount();
```

The component adds its mounted state in `onMount` and registers the corresponding reversal with `ctx.cleanup()`. The runtime executes that cleanup when the component is torn down.

---

## Next Steps

* [Components](./components.md) — the component model and mount flow
* [State](./state.md) — instance state and reactive updates
* [Watchers](./watch.md) — effects and automatic watcher disposal
* [Computed Values](./computed.md) — derived values and computed scope cleanup
* [Methods](./methods.md) — component behavior
* [Context](./context.md) — public context, `cleanup`, and `refs`
* [Props](./props.md) — component inputs
* [Interceptors](./interceptors.md) — root-level state write interception
