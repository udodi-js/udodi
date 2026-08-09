# Udodi Documentation

Udodi is a lightweight, dependency-free JavaScript UI framework built around fine-grained reactivity, declarative templates, and a minimal developer-facing API.

It is designed for developers who want the simplicity of a small JavaScript library without giving up the capabilities needed to build real applications.

Udodi brings together the core building blocks needed to build reactive applications:

* Fine-grained reactivity
* Declarative HTML templates
* Component-based architecture
* Reactive state management
* Component-scoped styling
* Persistent stores
* Asynchronous query management
* Form state and validation
* Application overlays and modals

The goal is simple: give you the primitives to build reactive interfaces and applications without forcing your application into a large framework architecture.

---

## Get Started

If you are new to Udodi, start here.

| Guide | Description |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[Installation](./installation.md)** | Install Udodi and learn the available distribution formats. |
| **[Quick Start](./quick-start.md)** | Build your first reactive Udodi application. |
| **[Your First Component](./first-component.md)** | Learn the basic structure of a Udodi component and how state, methods, computed values, watchers, interceptors, templates, and component styles work together. |
| **[Project Structure](./project-structure.md)** | Learn how to organize a Udodi application as it grows. |

---

## Learn Udodi

### Fundamentals

Understand the building blocks that make up a Udodi application.

* **[Components](./fundamentals/components.md)** — Define reusable UI and application logic.
* **[State](./fundamentals/state.md)** — Manage reactive component state.
* **[Methods](./fundamentals/methods.md)** — Encapsulate application behavior.
* **[Computed Values](./fundamentals/computed.md)** — Derive reactive values from state.
* **[Watchers](./fundamentals/watch.md)** — Observe reactive dependencies and respond to changes.
* **[Interceptors](./fundamentals/interceptors.md)** — Intercept state writes and runtime operations.
* **[Lifecycle](./fundamentals/lifecycle.md)** — Work with component creation, mounting, and cleanup.
* **[Props](./fundamentals/props.md)** — Pass data between components (including live bindings with `bindProp`).
* **[Context](./fundamentals/context.md)** — Understand the context available to components and directives.
* **[Component Styles](./fundamentals/styles.md)** — Define styles through a component's `style` property with CSS scoping.

**Start here → [Fundamentals](./fundamentals/)**

---

### Reactivity

Udodi uses fine-grained reactivity to update only the parts of the interface that depend on changed data.

Learn how Udodi's reactive primitives work together, including signals, effects, computed values, reactive objects, collections, and explicit dependency notification.

**Guides**

* [Reactivity Overview](./reactivity/overview.md)
* [Signals](./reactivity/signals.md)
* [Effects](./reactivity/effects.md)
* [Reactive State](./reactivity/state.md)
* [Reactive Collections](./reactivity/collections.md)
* [Reactive Arrays](./reactivity/arrays.md)
* [Using `touch()`](./reactivity/touch.md)
* [Read-only State](./reactivity/readonly.md)

**Start here → [Reactivity](./reactivity/)**

---

### Templates and Directives

Udodi templates use a small declarative DSL designed to keep templates readable and predictable.

Learn how to express UI structure, bind reactive data, respond to events, conditionally render content, render lists, control element attributes and styling, and register element refs.

**Guides**

* [Template Overview](./templates/overview.md)
* [Template DSL](./templates/dsl.md)
* [`@text`](./templates/text.md)
* [`@bind`](./templates/bind.md)
* [`@on`](./templates/on.md)
* [`@ref`](./templates/ref.md)
* [`@if`](./templates/if.md)
* [`@show`](./templates/show.md)
* [`@for`](./templates/for.md)
* [`@class`](./templates/class.md)
* [`@style`](./templates/style.md)
* [`@attr`](./templates/attr.md)
* [`@teleport`](./templates/teleport.md)

Form-oriented directives such as `@form`, `@validate`, and `@submit` are covered under [Forms](./forms/).

**Start here → [Templates](./templates/)**

---

### Forms and Validation

Udodi provides a form system for managing form state, field state, validation, and submission.

The form system supports both synchronous and asynchronous validation, with flexible validation modes for different application requirements.

**Guides**

* [Forms Overview](./forms/overview.md)
* [Creating a Form](./forms/creating.md)
* [Working with Fields](./forms/fields.md)
* [Validation](./forms/validation.md)
* [Sequential and Parallel Validation](./forms/sequential-parallel.md)
* [Form Submission](./forms/submission.md)
* [Form Controllers](./forms/controllers.md)
* [Async Validation](./forms/async.md)

**Start here → [Forms](./forms/)**

---

### Udodi Store

Udodi Store provides a simple way to manage reactive application state outside individual components.

Stores can be registered and shared across an application, allowing state to be organized independently from the components that consume it. Stores can optionally be persisted when application state needs to survive page reloads or application restarts.

The Store system covers three core areas:

* **Store** — Create and manage reactive application state.
* **Registry** — Register and access shared stores across an application.
* **Persistence** — Persist store state when needed.

**Guides**

* [Store Overview](./store/overview.md)
* [Creating Stores](./store/creating.md)
* [Store Registry](./store/registry.md)
* [Persistent Stores](./store/persistence.md)

**Start here → [Udodi Store](./store/)**

---

### Query Pool

Udodi's **Query Pool** provides a reactive runtime for asynchronous data and mutations. It coordinates **queries, mutations, dependencies, caching, invalidation, cancellation, and optional worker execution** while keeping query state synchronized with the UI.

Queries expose reactive state such as **`data`**, **`loading`**, **`error`**, and **`status`**, allowing components to react directly to asynchronous execution without manually coordinating request state.

The Query Pool also provides dependency-aware scheduling, so queries can declare relationships through **`dependsOn`** and execute according to the resulting dependency graph. Independent branches can execute concurrently when possible.

**What it covers**

* **Queries** — Local `source` / `compute` execution or worker `module` execution, with `fetch`, `refresh`, `cancel`, `reset`, and `invalidate` controls
* **Reactive State** — Query handles expose reactive `data`, `loading`, `error`, `status`, and related execution state
* **Dependencies** — Dependency-aware execution plans based on `dependsOn`, with independent branches able to execute in parallel
* **Caching** — Configurable TTL-based caching with controlled refresh and cache-aware execution
* **Mutations** — Write operations through `mutate`, with optimistic updates using `onMutate` / `setQueryData` and post-success invalidation through `invalidates`
* **Workers** — Optional compute-worker execution, module registration through `registerModule` / `registerModules`, and streaming where supported
* **Cancellation** — Abort in-flight query and mutation execution when work is no longer required
* **Invalidation** — Explicitly mark related queries stale so applications can control when affected data should be refreshed
* **Lifecycle** — Pool-level `refresh`, lookup helpers such as `get`, `has`, and `data`, and `terminate` for cleanup

**Invalidation is separate from execution.** Marking a query as stale does not implicitly determine when or how it should execute again. Applications retain control over refresh behavior and execution timing.

The Query Pool is designed to keep asynchronous application state **reactive, coordinated, and predictable**, while allowing execution to remain local or move into workers when appropriate.

**Guides**

* [Query Pool Overview](./query-pool/overview.md)
* [Queries](./query-pool/queries.md)
* [Mutations](./query-pool/mutations.md)
* [Query Dependencies](./query-pool/dependencies.md)
* [Caching](./query-pool/caching.md)
* [Invalidation](./query-pool/invalidation.md)
* [Query Scheduling](./query-pool/scheduling.md)
* [Query Pool and Workers](./query-pool/workers.md)

**Start here → [Query Pool](./query-pool/)**

---

### Overlay

Udodi includes a built-in **Overlay system** for managing modal, dialog, and other layered UI experiences through **`openModal`**, **`closeModal`**, and **`closeTopModal`**.

`openModal` returns a **Promise** that resolves with the value provided when the overlay closes, making it straightforward to coordinate overlay interactions with application logic.

The runtime manages the interaction details required for a robust overlay experience, including:

* Backdrop handling
* Escape-to-close behavior
* Scroll locking
* Focus trapping
* Focus restoration
* Overlay stacking and z-index management
* Optional host `className` and `zIndex` configuration

The Overlay system is part of Udodi's core runtime and is designed to handle common modal and dialog requirements without requiring an additional UI library.

**Guides**

* [Overlay Overview](./overlay/overview.md)
* [Opening Overlays](./overlay/opening.md)
* [Closing Overlays](./overlay/closing.md)
* [Overlay Options](./overlay/options.md)
* [Overlay Stacking](./overlay/stacking.md)
* [Accessibility](./overlay/accessibility.md)

**Start here → [Overlay](./overlay/)**


---

## Advanced Topics

Once you are comfortable with the fundamentals, explore Udodi's architecture, rendering model, performance characteristics, and advanced integration patterns.

* [Architecture](./advanced/architecture.md)
* [Performance](./advanced/performance.md)
* [CSS Scoping](./advanced/css-scoping.md)
* [DOM Rendering](./advanced/dom-rendering.md)
* [Server Integration](./advanced/server-integration.md)

These guides go beyond the everyday API to explain **how Udodi works, why it behaves the way it does, and how to use it effectively in more demanding applications**.

---

## API Reference

Use the API reference when you already know what you need and want precise details about a specific API.

* [API Reference Overview](./api/overview.md)
* [Component API](./api/component.md)
* [Reactivity API](./api/reactivity.md)
* [Form API](./api/form.md)
* [Store API](./api/store.md)
* [Query Pool API](./api/query-pool.md)
* [Overlay API](./api/overlay.md)
* [Utilities](./api/utilities.md)

The API reference should be treated as the authoritative reference for function signatures, options, return values, and behavior.

---

## Contributing

Udodi is open source, and contributions are welcome.

If you want to contribute to the framework itself, start with:

* [Development Setup](./contributing/setup.md)
* [Architecture](./advanced/architecture.md)
* [Testing](./contributing/testing.md)
* [Contributing Guide](../CONTRIBUTING.md)

You can also visit the [Udodi GitHub repository](https://github.com/udodi-js/udodi) to browse the source code, report issues, and contribute improvements.

---

## Documentation Map

Use this map to find the documentation for the part of Udodi you want to learn or use.

| Section             | Purpose                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Getting Started** | Install Udodi and build your first application                                                                               |
| **Fundamentals**    | Learn components, state, methods, computed values, watchers, interceptors, lifecycle, and component styles                   |
| **Reactivity**      | Understand Udodi's fine-grained reactive system and its core reactivity primitives                                           |
| **Templates**       | Learn Udodi's declarative template DSL, directives, DOM references, and template composition                                 |
| **Forms**           | Build forms and manage form state, validation, and submission                                                                |
| **Udodi Store**     | Manage shared, reactive, namespaced, and persistent application state                                                        |
| **Query Pool**      | Manage asynchronous data and mutations with caching, dependencies, invalidation, cancellation, and optional worker execution |
| **Overlay**         | Build modals, dialogs, and layered UI with managed lifecycles, stacking, focus handling, and interaction behavior            |
| **Advanced**        | Explore Udodi's architecture, CSS scoping, performance, and advanced runtime behavior                                        |
| **API Reference**   | Find precise documentation for the public API                                                                                |
| **Contributing**    | Learn how to develop, test, and contribute to Udodi itself                                                                   |

---

## Where Should I Start?

Use the guide below to jump directly to the part of Udodi that matches what you want to build or understand.

| I want to…                                   | Go here                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Get started with Udodi**                   | [Quick Start](./quick-start.md)                                                         |
| **Understand Udodi's reactivity model**      | [Reactivity Overview](./reactivity/overview.md)                                         |
| **Build a UI with templates and directives** | [Templates and Directives](./templates/)                                                |
| **Reference a DOM element from a component** | [`@ref`](./templates/ref.md)                                                            |
| **Build and validate forms**                 | [Forms Overview](./forms/overview.md)                                                   |
| **Manage shared application state**          | [Udodi Store](./store/)                                                                 |
| **Manage asynchronous data and mutations**   | [Query Pool](./query-pool/)                                                             |
| **Build modals, dialogs, and layered UI**    | [Overlay](./overlay/)                                                                   |
| **Style a component**                        | [Component Styles](./fundamentals/styles.md) & [CSS Scoping](./advanced/css-scoping.md) |
| **Understand Udodi's internal architecture** | [Architecture Guide](./advanced/architecture.md)                                        |
| **Look up exact API details**                | [API Reference](./api/)                                                                 |
| **Contribute to Udodi**                      | [Contributing Guide](../CONTRIBUTING.md)                                                |

---

**Udodi**  
Build reactive interfaces with less framework overhead.

[GitHub](https://github.com/udodi-js/udodi) · [Issues](https://github.com/udodi-js/udodi/issues) · [Discussions](https://github.com/udodi-js/udodi/discussions)
