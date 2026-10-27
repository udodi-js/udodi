# Udodi Router

Udodi Router is an optional, lightweight navigation layer for [Udodi](https://udodi.dev) applications. It handles URL matching, nested routes, guards, loaders, links, route outlets, and document metadata while staying aligned with Udodi's component-first model.

The router builds on Udodi's existing `createComponent()`, reactivity, and lifecycle APIs. It introduces no virtual DOM, no second reactivity system, and no `eval()` / `new Function()`.

## Design principles

- **Composition first**: Route views, layouts, links, and outlets are ordinary Udodi components.
- **Reuse Udodi's primitives**: Route state and rendering work with the existing runtime instead of a competing layer.
- **Transactional navigation**: Guards, loaders, and lazy components finish before the active route is committed.
- **Deterministic matching**: Static lookup plus specificity-ordered parametric routes (including constrained parameters).
- **Browser / server separation**: Client navigation is independent of the pure matching and metadata helpers used for SEO.
- **CSP-friendly**: Plain ES modules and native `import()` for lazy routes; no required build step.

## High-level flow

```
URL change
    │
    ▼
Match route
    │
    ▼
Run guards
    │
    ▼
Load route data
    │
    ▼
Resolve lazy components
    │
    ▼
Commit route state
    │
    ├──► RouterView       (render views)
    ├──► Head manager     (metadata and scripts)
    └──► Scroll behavior
```

Navigation is transactional: the previously committed route stays active until preparation succeeds. Cancelled or failed attempts never overwrite the current route.

## What you can build

- Nested layouts and child routes with nested `RouterView` outlets
- Reactive access to path, params, query, matched chain, meta, and loader data
- Programmatic navigation with explicit results (`completed`, `cancelled`, `redirected`, `error`)
- `router.Link()` and `router.RouterView()` inside ordinary Udodi templates
- Lazy-loaded route components resolved before commit
- HTML5, hash, or memory history with configurable scroll restoration
- Semantic document metadata (Open Graph, Twitter, JSON-LD, custom tags)
- Server-side matching and head generation via `udodi-router/server`

## A look at the API

A route is a plain configuration record that connects a path to a component:

```js
const router = createRouter({
  routes: [
    { path: "/", component: Home },
    { path: "/about", component: About },
    { path: "*", component: NotFound },
  ],
});
```

Render the active route with `router.RouterView()` and create links with `router.Link()`. Route views remain ordinary Udodi components; your templates control their markup.

See [Getting Started](./getting-started.md) for a complete working example.

## Documentation

### Foundation

- [Getting Started](./getting-started.md) — Install Udodi Router and create your first routed application.

### Routing

- [Routes](./routes.md) — Route records, path syntax, matching rules, and base paths.
- [Nested Routes](./nested-routes.md) — Parent/child routes, index routes, and nested layouts.
- [Route State](./route-state.md) — The reactive route object and active-route detection.

### Navigation

- [Navigation](./navigation.md) — Programmatic navigation, results, redirects, and cancellation.
- [Links and Outlets](./links-and-outlets.md) — `router.Link()`, active links, `router.RouterView()`, and view lifecycle.
- [Guards and Loaders](./guards-and-loaders.md) — Navigation guards, asynchronous data loading, and route data.

### Advanced behavior

- [Lazy Loading](./lazy-loading.md) — Asynchronous component resolution and caching.
- [History and Scroll](./history-and-scroll.md) — History adapters, navigation entries, and scroll restoration.

### SEO and metadata

- [Metadata](./metadata.md) — Metadata configuration, inheritance, and normalization.
- [Analytics and Scripts](./analytics-and-scripts.md) — Script policies and route-based analytics.
- [Server-Side SEO](./server-side-seo.md) — Server-side route matching, metadata resolution, and HTML generation.

### Reference

- [API Reference](./api-reference.md) — Public exports, options, methods, and type shapes.
- [Troubleshooting](./troubleshooting.md) — Common configuration and runtime issues.

## Installation

```sh
npm install udodi udodi-router
```

`udodi` is a peer dependency and must be declared by your application. The router does not bundle a second copy of Udodi.

For CDN usage and deployment notes, see [Getting Started](./getting-started.md).

## Server-side metadata

The `udodi-router/server` entry point provides browser-independent helpers for matching routes and generating head markup. These can be used in a server or static-generation pipeline without a full SSR framework.

See [Server-Side SEO](./server-side-seo.md) for the complete workflow.
