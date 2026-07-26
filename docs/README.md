# Udodi Documentation

Udodi is a lightweight, dependency-free JavaScript UI framework built around fine-grained reactivity, declarative templates, and a minimal developer-facing API.

It is designed for developers who want the simplicity of a small JavaScript library without giving up the capabilities needed to build real applications.

Udodi brings together the core building blocks needed to build reactive applications:

- Fine-grained reactivity
- Declarative HTML templates
- Component-based architecture
- Reactive state management
- Component-scoped styling
- Persistent stores
- Asynchronous query management
- Form state and validation
- Application overlays and modals

The goal is simple: give you the primitives to build reactive interfaces and applications without forcing your application into a large framework architecture.

---

## Get Started

If you are new to Udodi, start here.

| Guide                                            | Description                                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **[Installation](./installation.md)**            | Install Udodi and learn the available distribution formats.                                                                            |
| **[Quick Start](./quick-start.md)**              | Build your first reactive Udodi application.                                                                                           |
| **[Your First Component](./first-component.md)** | Learn the basic structure of a Udodi component and how state, methods, computed values, templates, and component styles work together. |
| **[Project Structure](./project-structure.md)**  | Learn how to organize Udodi application as it grows.                                                                                   |

---

## Learn Udodi

### Fundamentals

Understand the building blocks that make up a Udodi application.

- **[Components](./fundamentals/components.md)** — Define reusable UI and application logic.
- **[State](./fundamentals/state.md)** — Manage reactive component state.
- **[Methods](./fundamentals/methods.md)** — Encapsulate application behavior.
- **[Computed Values](./fundamentals/computed.md)** — Derive reactive values from state.
- **[Lifecycle](./fundamentals/lifecycle.md)** — Work with component creation, mounting, and cleanup.
- **[Props](./fundamentals/props.md)** — Pass reactive data between components.
- **[Context](./fundamentals/context.md)** — Understand the context available to components and directives.
- **[Component Styles](./fundamentals/styles.md)** — Define styles through a component's `style` property with CSS scoping.

**Start here → [Fundamentals](./fundamentals/)**

---

### Reactivity

Udodi uses fine-grained reactivity to update only the parts of the interface that depend on changed data.

Learn how Udodi's reactive primitives work together, including signals, effects, computed values, reactive objects, collections, and explicit dependency notification.

**Guides**

- [Reactivity Overview](./reactivity/overview.md)
- [Signals](./reactivity/signals.md)
- [Effects](./reactivity/effects.md)
- [Reactive State](./reactivity/state.md)
- [Reactive Collections](./reactivity/collections.md)
- [Reactive Arrays](./reactivity/arrays.md)
- [Using `touch()`](./reactivity/touch.md)
- [Read-only State](./reactivity/readonly.md)

**Start here → [Reactivity](./reactivity/)**

---

### Templates and Directives

Udodi templates use a small declarative DSL designed to keep templates readable and predictable.

Learn how to express UI structure, bind reactive data, respond to events, conditionally render content, render lists, and control element attributes and styling.

**Guides**

- [Template Overview](./templates/overview.md)
- [Template DSL](./templates/dsl.md)
- [`@text`](./templates/text.md)
- [`@bind`](./templates/bind.md)
- [`@on`](./templates/on.md)
- [`@if`](./templates/if.md)
- [`@show`](./templates/show.md)
- [`@for`](./templates/for.md)
- [`@class`](./templates/class.md)
- [`@style`](./templates/style.md)
- [`@attr`](./templates/attr.md)
- [`@teleport`](./templates/teleport.md)

**Start here → [Templates](./templates/)**

---

### Forms and Validation

Udodi provides a form system for managing form state, field state, validation, and submission.

The form system supports both synchronous and asynchronous validation, with flexible validation modes for different application requirements.

**Guides**

- [Forms Overview](./forms/overview.md)
- [Creating a Form](./forms/creating.md)
- [Working with Fields](./forms/fields.md)
- [Validation](./forms/validation.md)
- [Sequential and Parallel Validation](./forms/sequential-parallel.md)
- [Form Submission](./forms/submission.md)
- [Form Controllers](./forms/controllers.md)
- [Async Validation](./forms/async.md)

**Start here → [Forms](./forms/)**

---

### Udodi Store

Udodi Store provides a simple way to manage reactive application state outside individual components.

Stores can be registered and shared across an application, allowing state to be organized independently from the components that consume it. Stores can optionally be persisted when application state needs to survive page reloads or application restarts.

The Store system covers three core areas:

- **Store** — Create and manage reactive application state.
- **Registry** — Register and access shared stores across an application.
- **Persistence** — Persist store state when needed.

**Guides**

- [Store Overview](./store/overview.md)
- [Creating Stores](./store/creating.md)
- [Store Registry](./store/registry.md)
- [Persistent Stores](./store/persistence.md)

**Start here → [Udodi Store](./store/)**

---

### Query Pool

The Query Pool manages asynchronous query lifecycles and exposes reactive query state.

It provides a central place to define queries, coordinate dependencies between them, manage their lifecycles, and control how asynchronous data moves through an application.

Queries can support caching, cancellation, invalidation, and dependency-aware execution while remaining reactive to the rest of the application.

The Query Pool separates query invalidation from query execution, allowing applications to control when stale queries are refreshed.

**Guides**

- [Query Pool Overview](./query-pool/overview.md)
- [Queries](./query-pool/queries.md)
- [Query Dependencies](./query-pool/dependencies.md)
- [Caching](./query-pool/caching.md)
- [Invalidation](./query-pool/invalidation.md)
- [Query Scheduling](./query-pool/scheduling.md)
- [Query Pool and Workers](./query-pool/workers.md)

**Start here → [Query Pool](./query-pool/)**

---

### Overlay

Udodi provides a runtime overlay system for building modal and dialog experiences outside the normal document flow.

The Overlay system manages the lifecycle of active overlays and provides features such as backdrop handling, Escape-to-close behavior, scroll locking, focus management, and stacked overlays.

Overlays can return a result when closed, allowing application code to await an overlay's completion and respond to the value returned by the modal content.

**Guides**

- [Overlay Overview](./overlay/overview.md)
- [Opening Overlays](./overlay/opening.md)
- [Closing Overlays](./overlay/closing.md)
- [Overlay Options](./overlay/options.md)
- [Overlay Stacking](./overlay/stacking.md)
- [Accessibility](./overlay/accessibility.md)

**Start here → [Overlay](./overlay/)**

---

## Advanced Topics

Once you are comfortable with the fundamentals, explore the internals and advanced capabilities of Udodi.

- [Architecture](./advanced/architecture.md)
- [Performance](./advanced/performance.md)
- [CSS Scoping](./advanced/css-scoping.md)
- [DOM Rendering](./advanced/dom-rendering.md)
- [Server Integration](./advanced/server-integration.md)

These guides explain not only how to use Udodi, but also why it behaves the way it does.

---

## API Reference

Use the API reference when you already know what you need and want precise details about a specific API.

- [API Reference Overview](./api/overview.md)
- [Component API](./api/component.md)
- [Reactivity API](./api/reactivity.md)
- [Form API](./api/form.md)
- [Store API](./api/store.md)
- [Query Pool API](./api/query-pool.md)
- [Overlay API](./api/overlay.md)
- [Utilities](./api/utilities.md)

The API reference should be treated as the authoritative reference for function signatures, options, return values, and behavior.

---

## Contributing

Udodi is open source, and contributions are welcome.

If you want to contribute to the framework itself, start with:

- [Development Setup](./contributing/setup.md)
- [Architecture](./advanced/architecture.md)
- [Testing](./contributing/testing.md)
- [Contributing Guide](../CONTRIBUTING.md)

You can also visit the [Udodi GitHub repository](https://github.com/udodi-js/udodi) to browse the source code, report issues, and contribute improvements.

---

## Documentation Map

| Section             | Purpose                                                                            |
| ------------------- | ---------------------------------------------------------------------------------- |
| **Getting Started** | Install Udodi and build your first application                                     |
| **Fundamentals**    | Learn components, state, methods, computed values, lifecycle, and component styles |
| **Reactivity**      | Understand Udodi's fine-grained reactive system                                    |
| **Templates**       | Learn the declarative template DSL                                                 |
| **Forms**           | Manage forms, validation, and submission                                           |
| **Udodi Store**     | Manage shared, reactive, and persistent application state                          |
| **Query Pool**      | Manage asynchronous queries and their dependencies                                 |
| **Overlay**         | Build modal and dialog experiences with managed overlay lifecycles                 |
| **Advanced**        | Explore architecture, CSS scoping, performance, and advanced behavior              |
| **API Reference**   | Find precise API documentation                                                     |
| **Contributing**    | Develop and contribute to Udodi itself                                             |

---

## Where Should I Start?

| I want to…                                      | Go here                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| I am new to Udodi                               | [Quick Start](./quick-start.md)                                                         |
| I know Udodi and want to understand reactivity  | [Reactivity Overview](./reactivity/overview.md)                                         |
| I want to build a UI                            | [Templates and Directives](./templates/)                                                |
| I want to build a form                          | [Forms Overview](./forms/overview.md)                                                   |
| I want to manage shared application state       | [Udodi Store](./store/)                                                                 |
| I want to manage asynchronous data and queries  | [Query Pool](./query-pool/)                                                             |
| I want to build a modal or dialog               | [Overlay](./overlay/)                                                                   |
| I want to add styles to a component             | [Component Styles](./fundamentals/styles.md) & [CSS Scoping](./advanced/css-scoping.md) |
| I want to understand how Udodi works internally | [Architecture Guide](./advanced/architecture.md)                                        |
| I want exact API details                        | [API Reference](./api/)                                                                 |
| I want to contribute to Udodi                   | [Contributing Guide](../CONTRIBUTING.md)                                                |

---

**Udodi**
Build reactive interfaces with less framework overhead.

[GitHub](https://github.com/udodi-js/udodi) · [Issues](https://github.com/udodi-js/udodi/issues) · [Discussions](https://github.com/udodi-js/udodi/discussions)
