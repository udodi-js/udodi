---
title: Nested Routes
description: Compose parent routes, child routes, index routes, and nested layouts with Udodi Router.
---

# Nested Routes

Nested routes let you organize related pages under a shared layout. A parent route can render navigation, sidebars, or other persistent UI while its child routes determine the content displayed inside a nested outlet.

In Udodi Router, nested routes are declared through a parent's `children` array. The resulting hierarchy determines both how paths are composed and how matched components are rendered.

## Defining child routes

Use `children` to declare routes beneath a parent record:

```js
const routes = [
  {
    path: "/dashboard",
    component: DashboardLayout,
    children: [
      { path: "", component: DashboardHome },
      { path: "settings", component: DashboardSettings },
      { path: "users", component: UserList },
    ],
  },
];
```

These records define the following paths:

| Route path | Resolved URL |
| --- | --- |
| Parent `/dashboard` | `/dashboard` |
| Index child `""` | `/dashboard` |
| Relative child `settings` | `/dashboard/settings` |
| Relative child `users` | `/dashboard/users` |

Child paths are relative to the parent unless they begin with `/`. See [Routes](./routes.md) for path syntax, parameter constraints, and matching priority.

## Rendering nested layouts

Declaring nested routes establishes the hierarchy. To display nested content, the parent layout must include a nested `router.RouterView()` outlet.

The application-level outlet renders the first matched component. An outlet inside that component renders the next matched component, and so on through the hierarchy.

Example parent layout:

```js
const DashboardLayout = createComponent({
  name: "DashboardLayout",
  template: html`
    <section class="dashboard">
      <aside>
        <h2>Dashboard</h2>
        <!-- Shared navigation -->
      </aside>

      <main>
        ${router.RouterView()}
      </main>
    </section>
  `,
});
```

The root application also needs an outlet:

```js
const App = createComponent({
  name: "App",
  template: html`
    <header>
      <h1>My Application</h1>
    </header>

    <main>
      ${router.RouterView()}
    </main>
  `,
});
```

The root outlet renders the parent layout. The layout's nested outlet renders the selected child.

## How outlet depth works

Udodi Router determines outlet depth from the enclosing route-view host. The root outlet has depth `0`. An outlet inside a component rendered at depth `0` has depth `1`, and so on.

```text
Application
└── RouterView (depth 0)
    └── DashboardLayout
        └── RouterView (depth 1)
            ├── DashboardHome        →  /dashboard
            ├── DashboardSettings    →  /dashboard/settings
            └── UserList             →  /dashboard/users
```

For `/dashboard/settings`, the matched chain contains `DashboardLayout` followed by `DashboardSettings`. The root outlet renders the layout; the nested outlet renders the settings view.

When navigating between children that share the same parent record, the parent layout remains mounted. Its nested outlet independently switches the child view. Layout state (for example an expanded sidebar) therefore persists across those navigations.

See [Links and Outlets](./links-and-outlets.md) for outlet lifecycle, view retention, and route activation behavior.

## Index routes

An index route uses an empty child path (`""`). It shares the parent's URL and supplies the default child view for that location.

```js
{
  path: "/account",
  component: AccountLayout,
  children: [
    { path: "", component: AccountOverview },
    { path: "profile", component: AccountProfile },
    { path: "security", component: AccountSecurity },
  ],
}
```

| URL | Rendered hierarchy |
| --- | --- |
| `/account` | `AccountLayout` → `AccountOverview` |
| `/account/profile` | `AccountLayout` → `AccountProfile` |
| `/account/security` | `AccountLayout` → `AccountSecurity` |

The index child becomes the selected leaf at `/account` while the parent remains in the matched chain.

Without an index child, the parent path can match the parent alone; its nested outlet then has no child route to render at that depth.

Use one index child per parent URL. Udodi Router supports an index child that shares its parent's path, but rejects other duplicate route patterns.

## Relative child paths

Relative paths are useful when the parent defines a shared URL prefix.

```js
{
  path: "/projects/:projectId",
  component: ProjectLayout,
  children: [
    { path: "", component: ProjectOverview },
    { path: "tasks", component: ProjectTasks },
    { path: "tasks/:taskId", component: ProjectTask },
  ],
}
```

These resolve to:

- `/projects/:projectId`
- `/projects/:projectId/tasks`
- `/projects/:projectId/tasks/:taskId`

For a URL such as `/projects/42/tasks/7`, the matched chain includes `ProjectLayout` and `ProjectTask`. Route parameters are available through the router's route state.

See [Route State](./route-state.md) for `params`, `matched`, and the other reactive route properties.

## Absolute child paths

A child path that begins with `/` is matched from the application root instead of being prefixed with its parent's path.

```js
{
  path: "/account",
  component: AccountLayout,
  children: [
    { path: "profile", component: AccountProfile },
    { path: "/login", component: Login },
  ],
}
```

The resolved URLs are `/account/profile` and `/login`.

**An absolute child path changes URL matching, not its position in the declared hierarchy.** Because `/login` remains a child of `AccountLayout`, the matched chain retains that ancestor. The `Login` component therefore still renders at the nested outlet depth under the parent layout.

If `/login` should render independently of `AccountLayout`, declare it as a root-level route:

```js
const routes = [
  {
    path: "/account",
    component: AccountLayout,
    children: [
      { path: "profile", component: AccountProfile },
    ],
  },
  {
    path: "/login",
    component: Login,
  },
];
```

Choose relative or absolute children according to both the desired URL structure and the intended layout hierarchy.

## Keep parent layouts focused

A good parent layout owns shared UI and one nested outlet. Child components own the content specific to their routes.

```text
Application
└── RouterView
    └── AccountLayout
        ├── AccountNavigation
        └── RouterView
            ├── AccountOverview
            ├── AccountProfile
            └── AccountSecurity
```

This composition keeps shared UI in one place rather than duplicating it across every child page.

For route-specific view caching and activation notifications, see [Links and Outlets](./links-and-outlets.md). For navigation guards and child data loaders, see [Guards and Loaders](./guards-and-loaders.md).
