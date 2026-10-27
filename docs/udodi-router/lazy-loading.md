---
title: Lazy Loading
description: Load Udodi Router components on demand with native dynamic imports, caching, and recoverable loading failures.
---

# Lazy Loading

Udodi Router supports lazy-loaded route components through the `loadComponent` route option. Instead of importing a component when the application starts, you provide a function that resolves the component when a navigation needs it.

This lets applications split page components into separate modules while keeping route definitions straightforward.

## Defining a lazy route

Use `loadComponent` instead of a statically supplied `component` when a route should resolve its component on demand.

```js
const routes = [
  {
    path: "/reports",
    loadComponent: () => import("./pages/Reports.js"),
  },
];
```

The `loadComponent` function must resolve to a Udodi component factory. For a standard ES module with a default export, the router unwraps the module's `default` export automatically.

For example, `./pages/Reports.js` can export a component factory like this:

```js
import { createComponent, html } from "udodi";

export default createComponent({
  name: "Reports",

  template: html`
    <section>
      <h1>Reports</h1>
      <p>Your reports appear here.</p>
    </section>
  `,
});
```

The router can then load and render this component when `/reports` becomes the destination.

### Using a named export

If the module exports the component under a named export, return that component factory explicitly:

```js
{
  path: "/reports",
  loadComponent: () =>
    import("./pages/Reports.js").then(
      ({ Reports }) => Reports,
    ),
}
```

The callback may return a promise, but its resolved value must be the component factory itself. The router also accepts a component factory returned directly by `loadComponent`.

## When components are loaded

Lazy components are resolved as part of navigation, after route matching, guards, and loaders have completed successfully.

```text
Navigation request
    │
    ▼
Match route
    │
    ▼
Run guards
    │
    ▼
Run loaders
    │
    ▼
Resolve lazy components
    │
    ▼
Resolve metadata
    │
    ▼
Commit route state
```

The router resolves lazy components in matched parent-to-child order. Components belonging to the matched route chain are prepared before the destination is committed.

This has three important consequences:

- **A guard can stop unnecessary loading.** If a guard cancels or redirects navigation, the original destination's lazy components are not resolved.
- **Loader failures stop the transition.** If a loader fails, lazy component resolution for that destination does not proceed.
- **The active route stays committed until preparation succeeds.** The router does not switch to the destination while its required lazy components are still unresolved.

See [Guards and Loaders](./guards-and-loaders.md) for the full preparation contract.

## Caching resolved components

Udodi Router caches successfully resolved component definitions by route-record identity.

On later navigations to the same route record, the router reuses the resolved component rather than invoking `loadComponent` again.

```js
{
  path: "/users/:id",
  loadComponent: () => import("./pages/User.js"),
}
```

Navigating from `/users/10` to `/users/20` uses the same route record. The component definition is therefore reused instead of imported again for each parameter value.

Component-definition caching is separate from route-view caching. The former avoids resolving the same component definition repeatedly; the latter, configured with `keepAlive`, can retain mounted component instances.

See [Links and Outlets](./links-and-outlets.md) for route-view caching and lifecycle behavior.

## Concurrent loading and cancellation

Concurrent navigations that need the same lazy component share its in-flight loading promise. This prevents duplicate calls to `loadComponent` for the same route record while a load is pending.

A navigation's abort signal controls whether that navigation continues waiting for the result. It does not directly cancel the shared component-loading promise.

If a navigation is superseded while a component is loading:

1. The superseded navigation stops waiting and cannot commit its destination.
2. The shared component load may continue.
3. If the load succeeds, the resolved component can be reused by a later navigation.
4. If another navigation still needs that component, it can adopt the same in-flight load.

This distinction allows navigation to remain responsive without discarding useful asynchronous work.

## Recovering from loading failures

If `loadComponent` rejects, the current navigation fails and its destination is not committed. The previously committed route remains active.

The router removes the failed in-flight promise from its cache. A later navigation can invoke `loadComponent` again and retry the load.

```js
const routes = [
  {
    path: "/reports",
    loadComponent: () => import("./pages/Reports.js"),
  },
];

const router = createRouter({ routes });

const result = await router.push("/reports");

if (result.type === "error") {
  console.error("Unable to load the Reports page:", result.error);
}
```

**Retry happens on a subsequent navigation attempt, not through an automatic retry loop.** Udodi Router does not automatically apply retry delays, reload the page, or repeatedly invoke a failing loader.

A failed import can also reflect a deployment issue, such as stale HTML referring to a chunk that is no longer available. Investigate the underlying error rather than assuming every failure is transient.

See [Navigation](./navigation.md) for navigation result types and [Troubleshooting](./troubleshooting.md) for common loading failures.

## Showing loading feedback

Because lazy component resolution occurs before route commit, the destination view does not render while its component is still loading. The previously committed route remains active, and `router.route.pending` indicates that the latest navigation is being prepared.

You can use that property to display application-level feedback:

```js
import { createComponent, html, effect } from "udodi";

const NavigationStatus = createComponent({
  name: "NavigationStatus",

  state() {
    return {
      pending: false,
    };
  },

  onMount(root, ctx) {
    const stop = effect(() => {
      ctx.pending = router.route.pending;
    });

    ctx.cleanup(stop);
  },

  template: html`
    <p @if="pending">Loading page...</p>
  `,
});
```

This is a simple application-level indicator; it is not a route-specific loading fallback supplied by `RouterView`.

For the complete route-state contract, see [Route State](./route-state.md).

## Bundlers and native ES modules

Lazy route loading uses native dynamic `import()` rather than runtime code generation. This is consistent with Udodi's CSP-friendly design and does not require a dedicated router build step.

When using a bundler, prefer explicit import paths:

```js
{
  path: "/settings",
  loadComponent: () => import("./pages/Settings.js"),
}
```

Static import paths make it easier for build tools to discover dependencies and produce separate chunks. Native ES modules can also be used without a bundler when the browser can access the required modules.

Ensure that your deployment serves the generated module files at the URLs referenced by your application. A missing or inaccessible chunk causes component resolution to fail and the navigation to return an error.
