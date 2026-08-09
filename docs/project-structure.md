# Project Structure

Udodi does **not** prescribe a fixed directory structure or application scaffold. Organize your codebase around ownership, cohesion, and clarity rather than adopting a framework-specific project taxonomy.

This guide presents practical structures that can start small and evolve as an application grows. The examples reflect Udodi's lightweight runtime model and its optional application systems, including **Store**, **Query Pool**, **Forms**, and **Overlay**.

The layouts below describe a **browser (client) Udodi application**. They are not a Node.js server skeleton. For APIs and full-stack repos, see [Client vs server](#client-vs-server).

---

## Principles

A maintainable Udodi application generally follows these principles:

1. **Start minimal** — A single entry file and a small number of components are sufficient for a small application.
2. **Introduce structure as needed** — Add directories when the application develops a genuine organizational need.
3. **Keep state close to its owner** — Prefer component state for local concerns. Introduce Store or Query Pool when state becomes shared or requires asynchronous lifecycle management.
4. **Prefer feature-based organization at scale** — Technical directories work well for smaller applications; feature boundaries become more useful as applications grow.
5. **Keep the core conceptually lean** — Routing and other application-level concerns should remain outside the core runtime unless they are explicitly provided by a companion package.

---

## A Small Application

A small application can begin with only an HTML entry point, a package manifest, and an application module:

```text
my-app/
├── index.html
├── package.json
└── src/
    └── app.js
```

```html
<!-- index.html -->
<div id="app"></div>
<script type="module" src="./src/app.js"></script>
```

```js
// src/app.js
import { createComponent, html, render } from "udodi";

const App = createComponent({
  name: "App",

  state() {
    return {
      message: "Hello, Udodi!",
    };
  },

  template: () => html`
    <main>
      <h1 @text="message"></h1>
    </main>
  `,
});

render(App(), document.getElementById("app"));
// Alternatively: render(App(), "#app");
```

This structure is sufficient for a prototype or small application. Introduce additional modules and directories when a file becomes difficult to maintain or when responsibilities naturally separate.

---

## A Growing Application

For a small-to-medium application, a technical organization can provide a straightforward starting point:

```text
my-app/
├── index.html                 # Application shell
├── package.json
│
├── public/
│   └── assets/
│
└── src/
    ├── app.js                 # Application bootstrap and root mounting
    │
    ├── components/            # Reusable UI components
    │   ├── App.js
    │   ├── Header.js
    │   └── UserCard.js
    │
    ├── pages/                 # Optional view-level components
    │   ├── Home.js
    │   └── Settings.js
    │
    ├── store/                 # Shared client-side state
    │   ├── auth.js
    │   └── settings.js
    │
    ├── query/                 # Query Pool definitions
    │   ├── pool.js
    │   ├── users.js
    │   └── posts.js
    │
    ├── forms/                 # Form definitions and helpers
    │   └── login.js
    │
    ├── overlays/              # Overlay content components
    │   └── ConfirmDialog.js
    │
    ├── services/              # External I/O and API helpers
    │   └── api.js
    │
    ├── utils/                 # Reusable pure utilities
    │   └── format.js
    │
    └── styles/
        └── global.css
```

These directories are optional. Do not create `query/`, `store/`, `forms/`, or `overlays/` until the application actually uses those systems.

---

## Application Entry

The application entry point should be responsible primarily for **bootstrapping the application**.

A typical `src/app.js` imports the root component, initializes any application-level systems that must exist before mounting, and renders the application:

```js
// src/app.js
import { render } from "udodi";
import { App } from "./components/App.js";

// Optional application-level initialization.
// import "./store/auth.js";
// import { pool } from "./query/pool.js";

render(App(), document.getElementById("app"));
```

The general flow is:

```text
index.html
    │
    ▼
  app.js                Application bootstrap
    │
    ▼
   App                  Root component
    │
    ├── pages
    └── components
```

Keep feature-specific implementation out of the entry module whenever possible. Its primary responsibility should remain application initialization and mounting.

---

## Components

Reusable components can initially live in a shared `components/` directory:

```text
src/components/
├── App.js
├── Header.js
└── UserCard.js
```

For example:

```js
// src/components/UserCard.js
import { createComponent, css, html } from "udodi";

export const UserCard = createComponent({
  name: "UserCard",

  state() {
    return {
      name: "Ada",
    };
  },

  style: css`
    :scope {
      display: block;
      padding: 1rem;
    }
  `,

  template: () => html`
    <article class="card">
      <h2 @text="name"></h2>
    </article>
  `,
});
```

Recommended practices:

* Prefer one primary component export per module when practical.
* Keep component-specific styles with the component.
* Extract unrelated functionality when a component module becomes difficult to navigate.
* Move genuinely shared components into an appropriate shared location as the application grows.

---

## Pages

A **page** is a component that represents a complete application view or screen. `pages/` is an organizational convention, not a built-in Udodi feature.

For example:

```text
src/pages/
├── Home.js
└── Settings.js
```

A page can compose reusable components:

```text
Home
├── Header
├── UserList
└── Footer
```

You do not need a router to use a `pages/` directory. Until routing is introduced, views can be selected through application state, navigation helpers, or application-specific logic.

Routing itself is an application-level concern and may be provided by a future or separate Udodi companion package.

---

## Where State Lives

Choose the smallest state-management mechanism that matches the scope and lifecycle of the data.

| Data or state                       | Preferred location      |
| ----------------------------------- | ----------------------- |
| UI state belonging to one component | **Component `state()`** |
| Shared client-side state            | **Udodi Store**         |
| Asynchronous or server-backed state | **Query Pool**          |

A useful rule is:

```text
Local UI state
    → component state()

Shared client-side application state
    → Store

Remote or asynchronous data
    → Query Pool
```

For example:

* A dialog's local open state can remain in its component.
* Authentication state shared by multiple areas of an application can use Store.
* User data loaded from an API, including caching and invalidation, belongs in Query Pool.

Avoid placing all application state in Store simply for consistency. Keeping local state local reduces unnecessary coupling.

---

## Udodi Store Modules

Use Udodi's public Store APIs, such as `defineStore`, to organize shared client-side state.

```text
src/store/
├── auth.js
└── settings.js
```

Example:

```js
// src/store/auth.js
import { defineStore } from "udodi";

export const auth = defineStore("auth", {
  state: {
    user: null,
    token: null,
  },

  actions: {
    setUser(ctx, user) {
      ctx.set("user", user);
    },

    logout(ctx) {
      ctx.set("user", null);
      ctx.set("token", null);
    },
  },
});
```

Initialize or register Store modules from the application entry point or from a dedicated Store initialization module when appropriate.

See [Udodi Store](./store/) for the complete Store API and organization patterns.

---

## Query Pool modules

Applications using Query Pool can maintain a shared pool instance and organize queries and mutations by responsibility or feature.

```text
src/
└── query/
    ├── pool.js      # shared createQueryPool() instance
    ├── users.js     # users queries and mutations
    └── posts.js     # posts queries and mutations
```

```js
// query/pool.js
import { createQueryPool } from "udodi";

export const pool = createQueryPool();
```

Feature modules can define the queries and mutations that belong to them:

```js
// query/users.js
import { pool } from "./pool.js";

export const usersQuery = pool.query("users", {
  source: async (signal) => {
    const res = await fetch("/api/users", { signal });

    if (!res.ok) {
      throw new Error("Failed to fetch users");
    }

    return res.json();
  },
});
```

Use **one shared pool per application** unless a deliberate isolation boundary requires otherwise. Ensure modules that register queries or mutations are loaded before those definitions are used.

As an application grows, colocate Query Pool definitions with their features:

```text
src/
└── features/
    ├── users/
    │   ├── query/
    │   │   ├── users.js
    │   │   └── mutations.js
    │   ├── components/
    │   └── overlays/
    │
    └── posts/
        ├── query/
        │   └── posts.js
        └── components/
```

Keep the Query Pool layer responsible for **asynchronous application data**, while component state remains local and the Store handles shared client-side state.

```text
Local UI state?
  → component state()

Shared client-side state?
  → Udodi Store

Remote / asynchronous data?
  → Query Pool
```

Reusable HTTP or external I/O helpers can live in `services/` and be consumed by query `source` functions or mutation `execute` functions. If an operation is used only once, keeping it with the query or mutation is usually simpler.

For queries, mutations, caching, dependencies, workers, and lifecycle APIs, see [Query Pool](./query-pool/).

---

## Forms and Overlays

Forms and overlays can initially have dedicated directories:

```text
src/
├── forms/
│   └── login.js
│
└── overlays/
    └── ConfirmDialog.js
```

As the application grows, these concerns can instead be colocated with their owning feature:

```text
src/features/
├── auth/
│   └── forms/
│       └── login.js
│
└── users/
    └── overlays/
        └── UserDialog.js
```

Overlay content is typically implemented as a normal Udodi component. Overlay lifecycle is managed through the Overlay API, including `openModal`, `closeModal`, and `closeTopModal`.

The directory name does not have any special meaning to Udodi.

See [Forms](./forms/) and [Overlay](./overlay/) for details.

---

## Component Styles and Global CSS

Component-specific styles can remain with the component:

```text
UserCard.js
    → style: css`...`
```

Application-wide styles can live in a global stylesheet:

```text
styles/
└── global.css
```

A common separation is:

```text
Component styles
    → layout and presentation specific to that component

Global CSS
    → resets, typography, design tokens, and application-wide rules
```

Keeping component-specific styles close to their component improves ownership and reduces unnecessary coupling.

See [Component Styles](./fundamentals/styles.md) and [CSS Scoping](./advanced/css-scoping.md).

---

## Services and Utilities

### `services/`

Use `services/` for external I/O and integration logic, such as:

* HTTP requests
* API clients
* Authentication endpoints
* Browser or platform integrations
* Other external systems

For asynchronous application data, service functions can be consumed by Query Pool sources or mutations.

### `utils/`

Use `utils/` for reusable, preferably pure helper functions:

```text
utils/
├── formatCurrency.js
├── dates.js
└── validation.js
```

If a function is used only by one component or feature, keep it close to that owner until reuse justifies extraction.

---

## Feature-Based Organization

As an application grows, technical directories can become difficult to navigate because related code is distributed across multiple top-level folders.

At that point, organize code around application features:

```text
src/
├── app.js
│
├── features/
│   ├── auth/
│   │   ├── components/
│   │   ├── forms/
│   │   ├── store/
│   │   └── query/
│   │
│   └── users/
│       ├── components/
│       ├── query/
│       └── overlays/
│
├── shared/
│   ├── components/
│   ├── services/
│   └── utils/
│
└── styles/
    └── global.css
```

Feature-specific state, queries, forms, and UI remain together:

```text
features/users/
├── components/
├── query/
└── overlays/
```

Cross-feature primitives belong under `shared/`.

This structure is particularly useful when multiple developers or teams work on different application domains.

---

## Technical vs. Feature Organization

Neither organizational model is required by Udodi. Choose based on application size, domain boundaries, and team structure.

| Approach                                                | Best suited for                                                            |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Technical** (`components/`, `store/`, `query/`)       | Small-to-medium applications with relatively few features                  |
| **Feature-based** (`features/auth/`, `features/users/`) | Larger applications with clear domain boundaries                           |
| **Hybrid**                                              | Applications that combine feature-specific code with shared infrastructure |

A technical structure can evolve into a feature-based structure without requiring a change to Udodi itself.

The appropriate time to reorganize is when finding and maintaining related code becomes more difficult than the cost of moving it.

---

## Client vs server

The directory layouts in this guide target a **client-side Udodi app** (HTML shell, components, `render`, Store, Query Pool talking to HTTP APIs). They are **not** a Node.js server project structure.

| Concern | Where it lives |
| -------- | -------------- |
| UI, directives, overlays, component state | **Client** (this guide) |
| Shared client session / UI shell state | **Store** on the client |
| Fetch, cache, invalidate, mutate remote data | **Query Pool** on the client |
| HTTP routes, databases, auth issuance, business rules | **Server** (separate tree or service) |

### SPA only

Node may only build or serve static assets. The Udodi tree above is enough; the API can be any external backend.

### Full-stack repository

Keep the Udodi app and the API in separate trees so responsibilities stay clear:

```text
my-app/
├── package.json                 # optional workspaces
├── apps/
│   ├── web/                     # Udodi client (structure from this guide)
│   │   ├── public/
│   │   │   └── index.html
│   │   └── src/
│   │       ├── app.js
│   │       ├── components/
│   │       ├── query/
│   │       └── ...
│   │
│   └── api/                     # Node server (Express, Fastify, etc.)
│       └── src/
│           ├── index.js
│           ├── routes/
│           └── services/
│
└── packages/                    # optional shared types or pure utils
```

A simpler split is also fine:

```text
my-app/
├── client/    # Udodi — follow this guide
└── server/    # Node API
```

Client `services/` or Query Pool `source` functions call **your** API routes (`/api/users`, …). The server owns those routes; the client owns registration of queries and mutations.

### What not to do

* Treat `src/query/` or Store modules as the server data layer  
* Run `render`, templates, or overlays inside a Node HTTP process  
* Use this guide as the only layout for an API-only service  

Server layout should follow your chosen backend framework (routes, controllers, handlers, etc.), independent of Udodi’s client conventions.

---

## Recommended Starting Point

For a new application, keep the initial structure small:

```text
src/
├── app.js
├── components/
├── services/
├── utils/
└── styles/
    └── global.css
```

Add additional directories only when their corresponding concerns appear:

```text
store/       → shared client-side state
query/       → asynchronous data and mutations
forms/       → reusable form definitions and helpers
overlays/    → overlay content and related organization
```

This keeps the project structure proportional to the application's actual complexity.

---

## State and Data Decision Guide

Use the following decision process when deciding where a piece of state or data belongs:

```text
Used only inside one component?
    │
    └── Yes → component state()

Shared across multiple areas of the application?
    │
    └── Yes → Store

Loaded or written asynchronously?
    │
    └── Yes → Query Pool

Requires caching, invalidation, dependencies, or
worker-based execution?
    │
    └── Yes → Query Pool

Is it purely derived or transient UI state?
    │
    └── Keep it close to the component or feature that owns it
```

For overlays specifically:

```text
Local state for an overlay's content
    → component state()

Opening and coordinating an overlay
    → openModal() / closeModal() / closeTopModal()
```

Do not introduce global state simply because a value is used by more than one component. Consider whether the value represents **shared application state** or **asynchronous resource state** before choosing Store or Query Pool.

---

## What to Avoid

Udodi does not require any particular framework-style project taxonomy. Avoid introducing structure that does not correspond to an actual application need.

In particular:

* Do not reproduce another framework's directory structure without a reason.
* Do not create empty `store/`, `query/`, `pages/`, or `forms/` directories in a new project.
* Do not place server-backed resource state in Store when Query Pool is a better fit.
* Do not create application-wide globals as a substitute for the Store or Query Pool.
* Do not introduce abstractions solely to make a project appear more structured.
* Do not treat `pages/`, `services/`, or similar directories as Udodi-specific runtime concepts.
* Keep routing at the application level or use a dedicated companion package rather than treating it as part of the core `udodi` runtime.

The objective is not to maximize the number of directories. The objective is to make ownership and dependencies clear.

---

## Summary

| Layer          | Primary responsibility                                                            |
| -------------- | --------------------------------------------------------------------------------- |
| **Components** | UI, local state, templates, and component styles                                  |
| **Store**      | Shared reactive client-side state                                                 |
| **Query Pool** | Asynchronous queries, mutations, caching, dependencies, invalidation, and workers |
| **Forms**      | Form state, validation, and submission                                            |
| **Overlays**   | Modal and dialog content and overlay lifecycle                                    |
| **Services**   | Network requests and external integrations                                        |
| **Utils**      | Reusable pure helper functions                                                    |

Start with the smallest structure that keeps the application understandable. Introduce Store, Query Pool, Forms, Overlays, or feature boundaries when the application's requirements justify them.

Udodi provides the runtime systems; **the application determines the directory structure**.

---

## Where to Go Next

* [Your First Component](./first-component.md) — Learn the anatomy of a Udodi component
* [Fundamentals](./fundamentals/) — Explore the component model and core concepts
* [Reactivity](./reactivity/) — Learn about signals, effects, computed values, and fine-grained updates
* [Udodi Store](./store/) — Manage shared and persistent application state
* [Query Pool](./query-pool/) — Manage asynchronous queries, mutations, caching, dependencies, and workers
* [Forms](./forms/) — Build forms and manage validation and submission
* [Overlay](./overlay/) — Build modals, dialogs, and layered UI
* [Advanced Topics](./advanced/) — Explore architecture, rendering, performance, and deeper runtime behavior
