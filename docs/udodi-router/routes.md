---
title: Routes
description: Define Udodi Router routes, use path parameters and constraints, and understand matching priority.
---

# Routes

Routes map URL pathnames to route records. A route record can define a component, nested children, data loaders, navigation guards, and metadata.

This guide focuses on how route paths are defined and matched. See [Nested Routes](./nested-routes.md) for parent-child rendering and [Route State](./route-state.md) for the reactive state produced by a successful match.

## Defining routes

Pass route records to `createRouter()` through the `routes` option. Every record must have a string `path`.

```js
import { createRouter } from "udodi-router";

const router = createRouter({
  routes: [
    { path: "/", component: Home },
    { path: "/about", component: About },
    { path: "/users/:id", component: User },
    { path: "*", component: NotFound },
  ],
});
```

The router compiles the route table once during initialization, then matches incoming pathnames against the compiled routes.

## Path syntax

Udodi Router supports static paths, required parameters, constrained parameters, index routes, absolute child paths, and a single global fallback.

| Pattern | Example | Behavior |
| --- | --- | --- |
| Static path | `/users/new` | Matches the literal path. |
| Required parameter | `/users/:id` | Captures one path segment as `params.id`. |
| Constrained parameter | `/users/:id(\\d+)` | Captures a segment only when it matches the constraint. |
| Index child | `path: ""` | Shares its parent's URL and becomes the selected leaf at that URL. |
| Absolute child | `/login` | Uses `/login` instead of prefixing the parent's path. |
| Global fallback | `path: "*"` | Matches when no other route matches. Must be declared at the root level. |

Root-level paths are best written with a leading slash. Child paths may be relative to their parent or begin with `/` to become absolute.

Optional parameters and scoped catch-all patterns are not supported.

### Static paths

Static paths match literal segments.

```js
{
  path: "/users/new",
  component: NewUser,
}
```

Static routes take precedence over parameterized routes. For example, `/users/new` matches the static route above rather than treating `new` as a parameter value, even if `/users/:id` appears earlier in the configuration.

Static path matching is case-sensitive.

### Required parameters

Prefix a segment name with `:` to capture its value.

```js
{
  path: "/users/:id",
  component: User,
}
```

For the pathname `/users/42`, the matched route receives:

```js
params.id === "42"
```

Parameter values are decoded strings. A parameter matches exactly one path segment.

Use distinct parameter names within a single route pattern:

```js
{
  path: "/teams/:teamId/members/:memberId",
  component: TeamMember,
}
```

The corresponding parameters are `params.teamId` and `params.memberId`.

### Constrained parameters

Add a regular expression in parentheses after the parameter name to restrict which segment values can match.

```js
const routes = [
  {
    path: "/users/:id(\\d+)",
    component: User,
  },
  {
    path: "/:locale(en|fr|de)/products",
    component: Products,
  },
];
```

The first route matches only numeric user IDs. The second accepts only `en`, `fr`, or `de` as the locale segment.

Constraints use JavaScript regular-expression syntax and are **case-sensitive**. The expression is anchored to the entire segment, so a partial match is not sufficient. A constraint cannot contain `/` or match across path segments.

A constrained parameter is a matching rule, not a type conversion. `params.id` remains a string even when the constraint accepts only digits.

Constrained parameters are useful when the URL structure itself distinguishes routes:

```js
const routes = [
  { path: "/items/:id(\\d+)", component: ItemById },
  { path: "/items/:slug([a-z-]+)", component: ItemBySlug },
];
```

## Index routes

An index route uses an empty path (`""`) as a child of a parent route. It shares the parent's URL.

```js
{
  path: "/dashboard",
  component: DashboardLayout,
  children: [
    { path: "", component: DashboardHome },
    { path: "settings", component: DashboardSettings },
  ],
}
```

The index child matches `/dashboard`. The settings child matches `/dashboard/settings`.

When an index child exists, it becomes the selected leaf route at the shared URL while preserving the full parent-to-child matched chain. This allows the parent layout and its index view to participate in the same hierarchy.

For how parent and child components render together, see [Nested Routes](./nested-routes.md).

## Absolute child paths

By default, a child path is joined to its parent's path. A child path that begins with `/` is treated as absolute.

```js
{
  path: "/account",
  component: AccountLayout,
  children: [
    { path: "profile", component: Profile },
    { path: "/login", component: Login },
  ],
}
```

These paths resolve as follows:

| Child path | Resolved URL |
| --- | --- |
| `profile` | `/account/profile` |
| `/login` | `/login` |

An absolute child bypasses the parent path prefix. It is still declared inside the parent's route configuration; see [Nested Routes](./nested-routes.md) for how the matched hierarchy affects rendering.

## Matching priority

Udodi Router uses deterministic matching rather than relying solely on declaration order.

Matching follows these rules:

1. **Static paths are checked first.** An exact static match takes precedence over any parameterized route.
2. **Parameterized routes are ordered by segment specificity.** At each segment position, a static segment outranks a constrained parameter, which outranks an ordinary parameter.
3. **Declaration order breaks ties.** When two candidates have equal specificity, the earlier-declared route is preferred.
4. **The global fallback is checked last.** It is used only when no static or parameterized route matches.

Example:

```js
const routes = [
  { path: "/users/:value", component: UserByValue },
  { path: "/users/:id(\\d+)", component: UserById },
  { path: "/users/new", component: NewUser },
];
```

| Requested pathname | Selected route |
| --- | --- |
| `/users/new` | `/users/new` |
| `/users/42` | `/users/:id(\\d+)` |
| `/users/alex` | `/users/:value` |

You do not need to place every static route before every parameterized route for static matches to win.

Duplicate route patterns are rejected during compilation, except for the supported index-child case. Parameter names alone do not make otherwise identical patterns distinct.

## Path normalization

Route paths are normalized during compilation:

- A leading slash is added when necessary.
- Repeated slashes are collapsed.
- Trailing slashes are removed, except for the root path `/`.

For example, `/about/` and `about` both normalize to `/about`.

Define route paths without query strings or hash fragments. The matcher operates on the pathname only; query and hash are handled separately by the router.

```js
// Valid
{ path: "/search", component: Search }

// Invalid route patterns
{ path: "/search?q=router", component: Search }
{ path: "/search#results", component: Search }
```

Decoded parameter values are also required to stay within a single segment. A decoded slash or backslash in a parameter causes that candidate not to match.

## Deployment base path

Use the `base` option when the application is deployed below the domain root.

```js
const router = createRouter({
  routes,
  base: "/app",
});
```

Route definitions remain application-relative. With this base, the browser pathname `/app/about` is matched against the route `/about`.

The base is normalized the same way as a route path. A pathname outside the configured base does not produce a match.

Choose a base that matches the application's deployment location. For history modes and server fallback requirements, see [History and Scroll](./history-and-scroll.md).
