# Project Structure

As a Udodi application grows, organizing components, templates, styles, state, and application systems into a predictable structure makes the codebase easier to navigate and maintain.

Udodi does not require a specific project structure or directory layout. You are free to organize your application according to its size and requirements.

This guide presents practical structures that work well for small applications and can evolve as the application grows.

---

## A Small Udodi Application

For a small application, you can keep the structure simple:

```text
my-app/
├── index.html
├── app.js
├── styles.css
└── package.json
```

The application entry point can define and mount your components:

```js
// app.js

import { createComponent, html, render } from "udodi";

export const App = createComponent({
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

render(App(), "#app");
```

This is enough for a small application or prototype.

As the application grows, keeping everything in one file becomes difficult to maintain. At that point, move components and application systems into separate modules.


## A Growing Application

A typical application might look like this:

```text
my-app/
├── index.html
├── package.json
│
├── src/
│   ├── app.js
│   │
│   ├── components/
│   │   ├── App.js
│   │   ├── Header.js
│   │   ├── Navigation.js
│   │   └── UserProfile.js
│   │
│   ├── pages/
│   │   ├── Home.js
│   │   ├── Login.js
│   │   └── Settings.js
│   │
│   ├── store/
│   │   ├── auth.js
│   │   └── settings.js
│   │
│   ├── query/
│   │   ├── auth.js
│   │   └── users.js
│   │
│   ├── forms/
│   │   ├── login.js
│   │   └── profile.js
│   │
│   ├── overlays/
│   │   ├── ConfirmDialog.js
│   │   └── UserDialog.js
│   │
│   ├── services/
│   │   ├── api.js
│   │   └── auth.js
│   │
│   ├── utils/
│   │   └── format.js
│   │
│   └── styles/
│       └── global.css
│
└── public/
    └── assets/
```

This is only an example. You do not need to create every directory from the beginning.

Create directories when your application actually needs them.


## Application Entry Point

The application entry point is responsible for starting the application.

A common entry point is:

```text
src/app.js
```

It can import the root component and mount it:

```js
// app.js

import { render } from "udodi";

import { App } from "./components/App.js";

render(App(), "#app");
```

Your HTML provides the mount point:

```html
<div id="app"></div>
```

The entry point should generally contain application startup logic rather than the implementation of every component.

A useful mental model is:

```text
index.html
    ↓
app.js
    ↓
App component
    ↓
Application components
```


## Components

Reusable UI components can live under:

```text
src/components/
```

For example:

```text
src/components/
├── App.js
├── Header.js
├── Navigation.js
├── UserProfile.js
└── UserList.js
```

A component should generally represent a meaningful piece of UI or behavior.

For example:

```js
// components/UserProfile.js

import { createComponent, html } from "udodi";

export const UserProfile = createComponent({
	name: "UserProfile",

	state() {
		return {
			name: "John Doe",
		};
	},

	template: () => html`
		<section class="profile">
			<h2 @text="name"></h2>
		</section>
	`,
});
```

The component can then be imported by another component or by the application entry point:

```js
import { UserProfile } from "./components/UserProfile.js";
```

Keep components focused. If a component becomes responsible for unrelated UI and application logic, consider splitting it into smaller components.


## Pages

Larger applications often distinguish between reusable components and application-level pages:

```text
src/
├── components/
│   ├── Header.js
│   └── UserCard.js
│
└── pages/
    ├── Home.js
    ├── Login.js
    └── Settings.js
```

A **component** is generally reusable across multiple parts of the application.

A **page** usually represents a complete application view or route.

For example:

```text
pages/Home.js
    ├── Header
    ├── Navigation
    ├── UserList
    └── Footer
```

This distinction is optional. For small applications, pages can simply be components.


## State Management

Udodi provides reactive state at multiple levels.

### Component State

State that belongs only to one component should generally remain inside that component:

```js
state() {
  return {
    isOpen: false,
  };
},
```

For example, whether a dropdown is open is usually component-local state.

```text
UserMenu
└── isOpen
```

There is no need to move such state into a global store.

### Shared Application State

When multiple unrelated components need access to the same state, use [Udodi Store](./store/).

A project might organize stores like this:

```text
src/store/
├── auth.js
├── settings.js
└── cart.js
```

For example:

```text
App
├── Header
│   └── auth store
├── UserProfile
│   └── auth store
└── Settings
    └── settings store
```

Use component state for local concerns and stores for shared application state.


## Udodi Store

A store provides reactive state outside an individual component.

A store module might be organized like:

```text
src/store/
├── auth.js
├── cart.js
└── settings.js
```

For example:

```js
// store/auth.js

import { createStore } from "udodi";

export const authStore = createStore({
	user: null,
	authenticated: false,
});
```

The exact store API depends on how you configure and register your stores.

For details, see the [Udodi Store](./store/) documentation.

A useful rule is:

```text
Component state
    → State used by one component

Store
    → State shared across multiple parts of the application
```

Avoid putting all application state into a single global store. Keep state close to where it is consumed whenever possible.


## Query Pool

The Query Pool is intended for asynchronous query lifecycles and server-related data.

You may organize query definitions separately:

```text
src/query/
├── auth.js
├── users.js
├── posts.js
└── comments.js
```

For example:

```text
src/query/
├── auth.js
│
├── users.js
│   └── depends on auth
│
└── posts.js
    └── depends on users
```

This makes relationships between asynchronous data sources easier to understand.

The Query Pool can manage concerns such as:

- Asynchronous query execution
- Reactive query state
- In-flight execution deduplication
- Caching
- Cancellation
- Query reset
- Query dependencies
- Dependency-aware invalidation
- Scheduled refresh

For details, see the [Query Pool](./query-pool/) documentation.


## Forms

Forms can be organized by feature or by form type.

For a smaller application:

```text
src/forms/
├── login.js
├── registration.js
└── profile.js
```

For a larger application, forms can live alongside the feature that owns them:

```text
src/features/
├── auth/
│   ├── components/
│   ├── forms/
│   │   ├── login.js
│   │   └── registration.js
│   └── store/
│
└── profile/
    ├── components/
    └── forms/
        └── profile.js
```

Udodi's form system manages form and field state, validation, and submission.

See the [Forms](./forms/) documentation for details.


## Overlays

Application overlays such as dialogs and modal interfaces can be organized under:

```text
src/overlays/
├── ConfirmDialog.js
├── UserDialog.js
└── DeleteDialog.js
```

For larger applications, overlays can also be colocated with their feature:

```text
src/features/
├── users/
│   ├── components/
│   └── overlays/
│       ├── UserDialog.js
│       └── DeleteUserDialog.js
│
└── orders/
    ├── components/
    └── overlays/
        └── CancelOrderDialog.js
```

Use the [Overlay](./overlay/) documentation to learn how to manage modal and dialog lifecycles.


## Component Styles

Udodi components can define their styles through the component's `style` property:

```js
import { createComponent, css, html } from "udodi";

export const UserCard = createComponent({
	style: css`
		.card {
			padding: 1rem;
		}
	`,

	template: () => html`
		<article class="card">
			<h2>Profile</h2>
		</article>
	`,
});
```

This keeps component-specific presentation close to the markup it belongs to.

A component can therefore contain:

```text
UserCard.js
├── state
├── methods
├── template
└── style
```

You can use global styles for application-wide concerns:

```text
src/styles/
└── global.css
```

A useful separation is:

```text
Component style
    → Component-specific CSS

Global CSS
    → Application-wide styles
```

See [Component Styles](./fundamentals/styles.md) and [CSS Scoping](./advanced/css-scoping.md).


## Services

Services are useful for code that communicates with external systems or encapsulates application-level operations.

For example:

```text
src/services/
├── api.js
├── auth.js
└── storage.js
```

A service might encapsulate HTTP communication:

```js
// services/api.js

export async function fetchUsers() {
	const response = await fetch("/api/users");

	if (!response.ok) {
		throw new Error("Failed to fetch users");
	}

	return response.json();
}
```

The Query Pool can then use the service as a query source:

```js
const users = pool.query("users", {
	source: fetchUsers,
});
```

This separation keeps network communication separate from component presentation.


## Utilities

Generic reusable functions can live under:

```text
src/utils/
```

For example:

```text
src/utils/
├── format.js
├── validation.js
└── dates.js
```

Utilities should generally be independent of component-specific state.

For example:

```js
export function formatCurrency(value) {
	return new Intl.NumberFormat().format(value);
}
```

If a function only exists to support one component, it may be better to keep it close to that component rather than placing it in a global utilities directory.


## Feature-Based Organization

As an application becomes large, organizing everything by technical type can become difficult.

Instead of:

```text
src/
├── components/
├── forms/
├── store/
├── query/
└── overlays/
```

you can organize the application around features:

```text
src/
├── app.js
│
├── features/
│   ├── auth/
│   │   ├── components/
│   │   │   ├── LoginForm.js
│   │   │   └── UserMenu.js
│   │   ├── forms/
│   │   │   └── login.js
│   │   ├── store/
│   │   │   └── auth.js
│   │   └── queries/
│   │       └── auth.js
│   │
│   ├── users/
│   │   ├── components/
│   │   │   ├── UserList.js
│   │   │   └── UserProfile.js
│   │   ├── queries/
│   │   │   └── users.js
│   │   └── overlays/
│   │       └── UserDialog.js
│   │
│   └── settings/
│       ├── components/
│       ├── forms/
│       └── store/
│
├── shared/
│   ├── components/
│   ├── services/
│   └── utils/
│
└── styles/
    └── global.css
```

This structure keeps related functionality together.

For example, everything related to users can be found under:

```text
features/users/
```

This can be particularly useful for larger applications with multiple development teams.


## Choosing Between Technical and Feature-Based Structure

Both approaches are valid.

### Technical Structure

```text
src/
├── components/
├── forms/
├── store/
├── query/
└── overlays/
```

Works well when:

- The application is small or medium-sized.
- The number of features is limited.
- Developers frequently work across the entire application.

### Feature-Based Structure

```text
src/
└── features/
    ├── auth/
    ├── users/
    └── settings/
```

Works well when:

- The application is large.
- Features have independent state and queries.
- Multiple teams work on different areas.
- You want to keep related code together.

You can also combine both approaches.

For example:

```text
src/
├── features/
│   ├── auth/
│   └── users/
│
└── shared/
    ├── components/
    ├── services/
    └── utils/
```

This hybrid approach is often a good choice for larger applications.


## A Recommended Starting Structure

For most applications, start with something simple:

```text
src/
├── app.js
│
├── components/
├── store/
├── query/
├── forms/
├── overlays/
│
├── services/
├── utils/
│
└── styles/
    └── global.css
```

As the application grows, move toward feature-based organization when the existing structure becomes difficult to navigate.

Do not create directories simply because a framework recommends them. The goal of project structure is to make the application easier to understand, not to increase the number of folders.


## Keep State Close to Where It Is Used

One of the most useful principles when organizing Udodi application is to keep state as close as possible to the code that owns it.

For example, if a modal only needs to know whether it is open:

```js
state() {
  return {
    open: false,
  };
},
```

Keep that state in the component.

If authentication state is consumed by many unrelated parts of the application:

```text
Header
Profile
Settings
Protected Pages
```

a shared store is more appropriate.

If the data comes from an asynchronous source:

```text
Users API
Posts API
Authentication API
```

the Query Pool may be the appropriate system for managing the query lifecycle.

A simple decision model is:

```text
Is the state local to one component?
        │
        ├── Yes → Component state
        │
        └── No
             │
             ▼
Is it shared application state?
        │
        ├── Yes → Udodi Store
        │
        └── No
             │
             ▼
Does it represent asynchronous query data?
        │
        ├── Yes → Query Pool
        │
        └── No → Choose the simplest appropriate module
```

This keeps each Udodi system focused on the problem it is designed to solve.


## Example Application Architecture

A larger Udodi application might eventually look like:

```text
my-app/
├── index.html
├── package.json
│
├── public/
│   └── assets/
│
└── src/
    ├── app.js
    │
    ├── components/
    │   ├── App.js
    │   ├── Header.js
    │   └── Navigation.js
    │
    ├── features/
    │   ├── auth/
    │   │   ├── components/
    │   │   ├── forms/
    │   │   ├── queries/
    │   │   └── store/
    │   │
    │   ├── users/
    │   │   ├── components/
    │   │   ├── queries/
    │   │   └── overlays/
    │   │
    │   └── settings/
    │       ├── components/
    │       ├── forms/
    │       └── store/
    │
    ├── shared/
    │   ├── components/
    │   ├── services/
    │   └── utils/
    │
    └── styles/
        └── global.css
```

The resulting architecture separates responsibilities:

```text
Application
│
├── Components
│   └── UI and component behavior
│
├── Features
│   └── Feature-specific application logic
│
├── Udodi Store
│   └── Shared reactive state
│
├── Query Pool
│   └── Asynchronous query lifecycles
│
├── Forms
│   └── Form state and validation
│
├── Overlays
│   └── Modal and dialog experiences
│
├── Services
│   └── External communication
│
├── Utilities
│   └── Generic reusable functions
│
└── Styles
    └── Global application styles
```

This is not a required Udodi architecture. It is simply one way to organize a larger application using the capabilities provided by Udodi.


## Summary

Udodi does not impose a project structure.

Start small:

```text
app.js
components/
```

Add application systems as needed:

```text
store/
query/
forms/
overlays/
```

Then introduce feature-based organization when the application becomes large enough to benefit from it.

The most important principle is to organize code around **ownership and responsibility**:

- Keep local state in components.
- Use Udodi Store for shared reactive state.
- Use Query Pool for asynchronous query lifecycles.
- Keep forms close to the features that own them.
- Keep overlays reusable or colocated with their features.
- Keep external communication in services.
- Keep generic logic in utilities.
- Use component `style` for component-specific CSS.
- Use global styles only for application-wide concerns.

A good project structure should evolve with the application rather than becoming a constraint that the application has to work around.


## Where to Go Next

- [Your First Component](./first-component.md) — Learn the anatomy of Udodi component.
- [Fundamentals](./fundamentals/) — Explore the core component model.
- [Reactivity](./reactivity/) — Understand Udodi's reactive system.
- [Udodi Store](./store/) — Manage shared and persistent application state.
- [Query Pool](./query-pool/) — Manage asynchronous query lifecycles.
- [Forms](./forms/) — Build forms with validation and submission handling.
- [Overlay](./overlay/) — Build modal and dialog experiences.
- [Advanced Topics](./advanced/) — Explore Udodi's architecture and advanced behavior.
