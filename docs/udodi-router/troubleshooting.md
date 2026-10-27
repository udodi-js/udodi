---
title: Troubleshooting
description: Diagnose common Udodi Router configuration and runtime issues.
---

# Troubleshooting

This guide covers common configuration and runtime issues with Udodi Router. Each section describes the symptom, likely causes, and how to resolve them.

## Route matching

### No route matches the current URL

**Symptoms**

- Navigation returns an `error` result.
- `router.route.error` indicates that no route matched.
- Server-side `matchRoutes()` or `resolveHead()` returns `null`.

**Common causes**

1. The path is missing a leading `/` or contains a query string or hash.
2. The application is deployed under a subpath but `base` is not configured.
3. The catch-all route (`*`) is missing or not declared at the root level.
4. A constrained parameter rejects the segment (for example `:id(\\d+)` with a non-numeric value).

**What to check**

- Route paths must be pathname-only and application-relative. Do not include `?` or `#`.
- Configure `base` when the app is served under a prefix such as `/app`.
- Ensure a root-level `{ path: "*", component: NotFound }` exists if you want a fallback.
- Verify constrained parameters match the actual URL segments.

See [Routes](./routes.md) for path syntax and matching priority.

### Static route loses to a parameterized route

**Symptoms**

- `/users/new` is handled by `/users/:id` instead of a static `/users/new` route.

**Cause**

Udodi Router prefers static matches over parameterized ones, so this usually indicates a path normalization or declaration issue rather than specificity failure.

**What to check**

- Confirm both routes are declared correctly and normalize to distinct patterns.
- Remember that trailing slashes are stripped (except for `/`).
- Duplicate patterns are rejected at compile time; inspect the error thrown during `createRouter()`.

### Index route does not render

**Symptoms**

- Navigating to the parent URL shows the layout but no child content.

**Cause**

The parent has no index child (`path: ""`), so the nested `RouterView` has nothing to render at that depth.

**Solution**

Add an index child:

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

See [Nested Routes](./nested-routes.md).

## Navigation

### `push()` / `replace()` never resolves as `completed`

**Symptoms**

- Result type is `cancelled`, `redirected`, or `error`.

**What to check**

| Result | Likely cause |
| --- | --- |
| `cancelled` | A guard returned `false`, or a newer navigation superseded this one. |
| `redirected` | A guard returned a string or `{ path }` target. |
| `error` | Invalid target, no match, loader failure, lazy-load failure, or redirect loop. |

Always inspect `result.type` and, for errors, `result.error`.

See [Navigation](./navigation.md) and [Guards and Loaders](./guards-and-loaders.md).

### Redirect loop

**Symptoms**

- Navigation fails with a redirect-loop error.

**Cause**

Guards continually redirect to targets that redirect back, or the redirect chain exceeds the internal limit.

**Solution**

- Ensure at least one destination can complete without redirecting.
- Avoid unconditional redirects between `/login` and a protected route.
- Log the `redirectTo` values while debugging.

### Navigation appears to complete but the URL does not change

**Symptoms**

- Route state updates, but the address bar stays the same (or the opposite).

**Common causes**

1. Using `replace()` when you expected `push()`.
2. History adapter and router `base` are inconsistent.
3. Hash history is configured but you are looking at the pathname instead of the fragment.

**What to check**

- Confirm which history adapter is in use.
- Keep `base` consistent between `createRouter({ base })` and the history adapter.
- For hash mode, the application path lives in the fragment (`/#/about`).

See [History and Scroll](./history-and-scroll.md).

## Links and outlets

### Link click does a full page reload

**Symptoms**

- Clicking a `router.Link()` causes a full document navigation.

**Common causes**

1. The click was modified (Ctrl/Cmd/Shift/Alt) or used a non-primary button.
2. The anchor has `download`, `target` other than `_self`, or `rel="external"`.
3. The template root is not an element that receives the click handler as expected.

**What to check**

- Ordinary left-clicks on anchors are intercepted; modified clicks intentionally use native behavior.
- Prefer letting the router set `href` rather than supplying your own conflicting attributes.

See [Links and Outlets](./links-and-outlets.md).

### `isActive` never becomes true

**Symptoms**

- Active classes never apply, or the wrong link stays active.

**Common causes**

1. Missing or incorrect `exact` option for an index/overview link.
2. The `to` path does not match the declared route path (including base handling).
3. Reading a non-reactive snapshot of active state outside an effect or template.

**What to check**

- Use `exact: true` when a parent path should not stay active for nested children.
- Prefer the `isActive` value provided inside the `Link` template context.
- For manual checks, call `router.isActive()` inside an `effect` or computed so it tracks `activeVersion`.

### Nested `RouterView` is empty

**Symptoms**

- Parent layout renders, but the nested outlet shows nothing.

**Common causes**

1. No child matched at that depth (missing index route or wrong child path).
2. Outlet depth does not match the matched hierarchy.
3. Absolute child path still renders under the parent layout by design.

**What to check**

- Confirm the matched chain with `router.route.matched`.
- Ensure each layout that should show a child contains its own `router.RouterView()`.
- If a child should render outside the parent layout, declare it as a root-level route.

See [Nested Routes](./nested-routes.md).

## Guards and loaders

### Loader runs but data is missing in the component

**Symptoms**

- Component reads `router.route.data` and sees `undefined` or stale values.

**Common causes**

1. Reading data during preparation (before commit). While `pending` is `true`, route fields still describe the previous route.
2. Expecting parent loader data on `router.route.data` (that property is the leaf only).
3. Loader threw; navigation failed and the previous route remained active.

**What to check**

- Subscribe reactively to `router.route.data` after commit.
- For parent data, inspect `router.route.matched[i].data`.
- Handle `result.type === "error"` and `router.route.error`.

### Guard never runs

**Symptoms**

- Unauthenticated users reach a protected page.

**Common causes**

1. Guard is on a child but navigation matched a different branch.
2. Guard returned `undefined`/`true` unintentionally.
3. Client-side guard is treated as a security boundary (it is not).

**What to check**

- Place shared conditions on the parent that always matches the protected subtree.
- Return `false` to cancel or a target object/string to redirect.
- Enforce authorization on the server as well.

## Lazy loading

### Lazy page fails with a module error

**Symptoms**

- Navigation returns `error`; console shows import or chunk failures.

**Common causes**

1. Incorrect import path or missing file in the deployment.
2. Named export not unwrapped correctly.
3. Stale HTML referencing an old chunk after a new deploy.

**What to check**

```js
// Default export
loadComponent: () => import("./pages/Reports.js")

// Named export
loadComponent: () =>
  import("./pages/Reports.js").then(({ Reports }) => Reports)
```

- Verify the deployed assets match the import URLs.
- A failed load is removed from the cache; the next navigation can retry.

See [Lazy Loading](./lazy-loading.md).

### Loading indicator never appears

**Symptoms**

- User sees the previous page with no feedback during a slow import.

**Cause**

Lazy resolution happens before commit. The previous route stays active until preparation succeeds.

**Solution**

Reflect `router.route.pending` in application UI:

```js
effect(() => {
  ctx.showSpinner = router.route.pending;
});
```

## History, base, and scroll

### Direct refresh returns 404

**Symptoms**

- Client navigation works, but refreshing `/about` fails on the server.

**Cause**

HTML5 history requires the server to serve the application entry HTML for client routes.

**Solutions**

1. Configure server fallback to `index.html` (or equivalent).
2. Or switch to hash history:

```js
createRouter({
  routes,
  history: createHashHistory(),
});
```

### Links point to the wrong path under a subpath deployment

**Symptoms**

- App is hosted at `/app` but links navigate to `/about` instead of `/app/about`.

**Cause**

Missing or inconsistent `base`.

**Solution**

```js
const base = "/app";

createRouter({
  routes,
  base,
  history: createWebHistory({ base }),
});
```

Keep router `base` and the history adapter `base` aligned.

### Scroll jumps or does not restore on Back/Forward

**Symptoms**

- Scroll position is wrong after history traversal, or native restoration races with the app.

**What to check**

1. Provide a `scrollBehavior` that returns `savedPosition` when available.
2. When `scrollBehavior` is set, the router enables manual scroll restoration; ensure your policy covers the cases you care about.
3. Fragment targets must exist in the DOM when the callback runs.
4. Nested scroll containers are not managed automatically.

See [History and Scroll](./history-and-scroll.md).

## Metadata and scripts

### Title or meta tags do not update

**Symptoms**

- Document title stays on the previous page's value.

**Common causes**

1. Metadata is defined only on a parent that is not in the matched chain.
2. Navigation failed before commit, so metadata was not applied.
3. A child clears a field with `null` unintentionally.

**What to check**

- Inspect `router.route.meta` after a successful navigation.
- Confirm inheritance rules: omit inherits, override replaces, `null` clears.
- Head updates run after commit; failed navigations leave the previous head state.

See [Metadata](./metadata.md).

### Analytics fires twice on every navigation

**Symptoms**

- Double `page_view` events in Google Analytics.

**Cause**

Both the analytics bootstrap and the router report page views.

**Solution**

Initialize `gtag` with `send_page_view: false` and let the router report after commits. Avoid a second independent page-view handler for the same navigation.

See [Analytics and Scripts](./analytics-and-scripts.md).

### Script with `once: false` does not re-run side effects as expected

**Symptoms**

- Re-entering a route reinserts the script node, but global state or listeners remain from the previous run.

**Cause**

Removing a script element does not undo JavaScript that has already executed.

**Guidance**

Prefer `once: true` for long-lived services. Use `once: false` only when reinsertion is specifically required by the integration.

## Server-side SEO

### `resolveHead()` returns empty head

**Symptoms**

- `match` is `null` or `head` is an empty string.

**Common causes**

1. Pathname includes query/hash.
2. Base path mismatch.
3. No matching route and no catch-all.

**What to check**

- Pass pathname only: `url.pathname`.
- Supply `query` separately when loaders need it.
- Configure `base` consistently with the public URL structure.

### Dynamic metadata is missing loader data on the server

**Symptoms**

- Titles fall back to defaults even though a loader exists.

**Common causes**

1. `runLoaders: false` without providing `loaderData`.
2. Loader data keyed incorrectly (prefer a `Map` of route records).
3. Loader threw and the error was not handled at the request boundary.

**What to check**

- Keep `runLoaders: true` (default) unless you intentionally supply preloaded data.
- Use a `Map` keyed by the actual route-record objects when possible.

See [Server-Side SEO](./server-side-seo.md).

## General debugging tips

1. **Inspect navigation results**: Always check `result.type` from `push()` / `replace()` and the one-time `router.ready` promise.
2. **Watch reactive state**: `router.route.pending`, `router.route.error`, `router.route.matched`, and `router.route.meta` are the primary signals after commit.
3. **Compile-time errors**: Duplicate patterns, invalid constraints, and malformed route records throw during `createRouter()`. Read the full error message.
4. **Keep bases consistent**: Router `base`, history adapter `base`, and server matcher `base` should describe the same deployment prefix.
5. **Client guards are not security**: Protect data and actions on the server regardless of `beforeEnter` outcomes.

## Related guides

- [Routes](./routes.md) — Path syntax and matching
- [Navigation](./navigation.md) — Results, redirects, and cancellation
- [Guards and Loaders](./guards-and-loaders.md) — Preparation failures
- [Lazy Loading](./lazy-loading.md) — Component resolution errors
- [History and Scroll](./history-and-scroll.md) — Base paths and scroll behavior
- [Metadata](./metadata.md) — Head updates and inheritance
- [Server-Side SEO](./server-side-seo.md) — Server matching and head generation
