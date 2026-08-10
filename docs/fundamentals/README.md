# Fundamentals

The Fundamentals section introduces the core concepts used to build applications with Udodi.

Start with [Components](./components.md) to understand how Udodi organizes UI, state, behavior, and composition. The remaining guides explain the individual capabilities that make up a component.

---

## Components

[Components](./components.md) are the primary building blocks of a Udodi application.

A component combines state, behavior, derived values, templates, styles, and lifecycle into a reusable unit. Components can also be composed together and communicate through props.

**Start here if you are new to Udodi.**

---

## Component State and Behavior

These guides cover how components store, derive, and respond to data.

* [State](./state.md) — define and manage reactive component state.
* [Computed Values](./computed.md) — derive reactive values from existing state.
* [Methods](./methods.md) — define component behavior and event handlers.
* [Watchers](./watch.md) — respond to changes in reactive dependencies.
* [Interceptors](./interceptors.md) — transform or cancel state assignments before they are committed.

The typical relationship is:

```text
State
  │
  ├──► Computed Values
  │
  ├──► Watchers
  │
  └──► Template
```

Methods provide behavior that can read and update component state, while interceptors provide control over state writes.

---

## Component Communication

Components are designed to work together as a hierarchy.

* [Props](./props.md) — pass data from parent components to child components.
* [Context](./context.md) — understand the public context exposed to component code.

The basic data flow is:

```text
Parent
  │
  │ props / bindProp()
  ▼
Child
  │
  └──► public context
```

Use ordinary props when a child needs a value snapshot. Use `bindProp()` when the child needs an explicit reactive connection to parent state.

---

## Component Lifecycle

[Lifecycle](./lifecycle.md) explains how components are initialized, mounted, and cleaned up.

```text
Create
  │
  ▼
Initialize
  │
  ▼
Mount
  │
  ▼
Active
  │
  ▼
Unmount
  │
  ▼
Cleanup
```

Lifecycle hooks are useful when component behavior needs to interact with the DOM or perform setup and cleanup work.

---

## Component Presentation

[Component Styles](./styles.md) explains how to define styles that belong to a component.

Components can declare scoped CSS alongside their templates:

```js
const Card = createComponent({
  style: css`
    .card {
      padding: 1rem;
    }
  `,
});
```

For the underlying style-scoping mechanism, see [CSS Scoping](../advanced/css-scoping.md).

---

## How the Fundamentals Fit Together

A component typically brings several of these concepts together:

```text
                         Component
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
         Data             Behavior        Presentation
          │                  │                  │
        state             methods             template
        computed          watchers            style
        props             interceptors
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                         Lifecycle
                             │
                          onMount / onUnmount
```

The guides in this section are intentionally focused. Learn the component model first, then use the individual guides as references for each capability.

---

## Recommended Learning Path

If you are new to Udodi, follow the guides in this order:

1. [Components](./components.md) — understand the component model.
2. [State](./state.md) — learn reactive component state.
3. [Methods](./methods.md) — add component behavior.
4. [Computed Values](./computed.md) — derive values from state.
5. [Templates](../templates/) — build declarative component markup.
6. [Props](./props.md) — compose components and pass data between them.
7. [Context](./context.md) — understand how component code accesses its capabilities.
8. [Watchers](./watch.md) — respond to reactive changes.
9. [Interceptors](./interceptors.md) — control state assignments.
10. [Lifecycle](./lifecycle.md) — manage setup and cleanup.
11. [Component Styles](./styles.md) — add scoped component styling.

You do not need to read every guide before building an application. Start with Components, then refer to the relevant guide as your component requirements grow.

---

## Beyond the Fundamentals

Once you understand the component model, explore the other parts of Udodi:

* [Templates](../templates/) — templates, directives, and declarative DOM behavior.
* [Store](../store/) — application-level state and persistence.
* [Query Pool](../query-pool/) — asynchronous queries, mutations, caching, and reactive data.
* [Advanced](../advanced/) — lower-level runtime and advanced Udodi concepts.
* [API Reference](../api/) — authoritative API documentation.
