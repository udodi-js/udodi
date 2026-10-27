---
title: Route State
description: Understand Udodi Router's reactive route object, URL state, loader data, and active-route detection.
---

# Route State

Udodi Router exposes the current route through `router.route`, a reactive object containing the committed URL, matched route records, metadata, and loader data.

Because the route object uses Udodi's existing reactivity system, you can read its properties in component templates, effects, and other reactive computations without introducing another state-management layer.

## The route object

| Property | Description |
| --- | --- |
| `path` | Normalized pathname, excluding query string and hash. |
| `fullPath` | Complete application-relative URL, including query and hash when present. |
| `params` | Decoded route parameters, represented as strings. |
| `query` | Decoded query parameters, represented as strings. |
| `hash` | URL fragment including the leading `#`, or an empty string. |
| `matched` | Matched route records ordered from parent to child. Each entry includes its route-specific loader data. |
| `meta` | Merged metadata for the committed route. |
| `data` | Loader result for the active leaf route, or `undefined` when none is available. |
| `pending` | Whether the latest navigation is being prepared. |
| `error` | Error from the latest failed navigation, or `null` when there is none. |
| `activeVersion` | Reactive version counter updated on each successful commit. Used by active-route lookups. |

The route state starts with an empty matched chain and default values while the initial navigation is resolved.

## Reading route information

Given this route:

```js
{
  path: "/users/:id",
  component: User,
}
```

Navigating to `/users/42?tab=posts#latest` produces:

```js
router.route.path;       // "/users/42"
router.route.fullPath;   // "/users/42?tab=posts#latest"
router.route.params.id;  // "42"
router.route.query.tab;  // "posts"
router.route.hash;       // "#latest"
```

Pathname, query, and hash are kept separate so each can be used independently.

Query values are strings. When a query key appears multiple times, `router.route.query` retains the last value for that key.

### Object navigation targets

You can construct a target with an object instead of assembling a query string manually:

```js
await router.push({
  path: "/search",
  query: {
    q: "udodi",
    page: 2,
  },
  hash: "results",
});
```

The resulting route exposes the pathname through `path`, the query values through `query`, and the fragment through `hash`. The corresponding `fullPath` includes the serialized query string and hash.

See [Navigation](./navigation.md) for navigation methods and target formats.

## Matched route records

The `matched` array represents the active route hierarchy from parent to child.

```text
/dashboard
    │
    ▼
matched[0]  DashboardLayout
    │
    ▼
matched[1]  DashboardSettings
```

Each matched entry contains the corresponding route record and its loader data. Parent layouts and child views can therefore access data associated with their respective records.

Original route definitions are not mutated when this data is attached.

### Leaf loader data

For convenience, `router.route.data` exposes the loader result of the active leaf route:

```js
const data = router.route.data;
```

The value is `undefined` when the leaf has no loader result. Use `matched` when you need data belonging to individual records in a nested chain.

For loader signatures, execution order, and error handling, see [Guards and Loaders](./guards-and-loaders.md).

## Committed state and pending navigation

Udodi Router uses transactional navigation: the destination is prepared before the new active route is committed.

This distinction matters when a component reads `router.route` while navigation is in progress.

### While navigation is pending

The router sets `router.route.pending` to `true` while the latest navigation is being prepared.

The other route fields continue to describe the previously committed route. They do not become a partially updated representation of the destination.

You can reflect this state in an ordinary Udodi component:

```js
import { createComponent, html, effect } from "udodi";

const AppStatus = createComponent({
  name: "AppStatus",

  state() {
    return {
      isNavigating: false,
    };
  },

  onMount(root, ctx) {
    const stop = effect(() => {
      ctx.isNavigating = router.route.pending;
    });

    ctx.cleanup(stop);
  },

  template: html`
    <p @if="isNavigating">Loading the next page...</p>
  `,
});
```

The reactive read of `router.route.pending` causes the effect to re-run when that property changes.

### When navigation succeeds

After preparation succeeds, the router commits the destination's pathname, parameters, query, hash, matched records, metadata, and leaf loader data.

It then sets `pending` to `false`, clears any previous navigation error, and increments `activeVersion`.

### When navigation fails

If preparation fails, the router sets `pending` to `false` and stores the error in `router.route.error`. The previously committed route remains active.

```js
const error = router.route.error;

if (error) {
  console.error("Navigation failed:", error.message);
}
```

A cancelled or superseded navigation is not necessarily a failure. See [Navigation](./navigation.md) for the meanings of `completed`, `cancelled`, `redirected`, and `error` results.

## Route metadata

The `meta` property contains the merged metadata associated with the committed route:

```js
const title = router.route.meta.title;
```

This is useful when application UI needs to reflect metadata already resolved by the router, for example, displaying the current page title without re-implementing metadata resolution.

Route metadata can be static or computed from route parameters and loader data. Inheritance is resolved along the matched parent chain.

See [Metadata](./metadata.md) for supported fields, inheritance rules, defaults, and custom head tags.

## Active-route detection

Use `router.isActive(path, exact?)` to determine whether a pathname belongs to the currently committed route hierarchy.

```js
router.isActive("/dashboard");
```

By default the check examines the matched route chain. This allows a parent layout to remain active while one of its nested routes is displayed.

### Prefix versus exact matching

| Call | Behavior |
| --- | --- |
| `router.isActive("/dashboard")` | `true` when `/dashboard` belongs to the committed matched chain, including when a matched child is active. |
| `router.isActive("/dashboard", true)` | `true` only when the committed pathname is exactly `/dashboard` after normalization. |

Non-exact matching is based on the compiled matched-route hierarchy, not a general string-prefix comparison.

When `/dashboard/settings` is active and `/dashboard` is a matched parent:

```js
router.isActive("/dashboard");       // true
router.isActive("/dashboard", true); // false
```

Query strings and hashes are ignored when determining whether a path is active.

### Reactive active-route checks

`router.isActive()` participates in Udodi's reactivity system. It tracks `router.route.activeVersion`, so a reactive computation that calls it updates after a route is committed.

```js
import { createComponent, html, effect } from "udodi";

const DashboardStatus = createComponent({
  name: "DashboardStatus",

  state() {
    return {
      dashboardActive: false,
    };
  },

  onMount(root, ctx) {
    const stop = effect(() => {
      ctx.dashboardActive = router.isActive("/dashboard");
    });

    ctx.cleanup(stop);
  },

  template: html`
    <p @if="dashboardActive">Dashboard section is active.</p>
  `,
});
```

This is useful for route-dependent UI such as navigation indicators, breadcrumbs, and layout visibility.

For navigation links, the simpler approach is usually to use the `isActive` value provided by `router.Link()` directly in its template. See [Links and Outlets](./links-and-outlets.md).
