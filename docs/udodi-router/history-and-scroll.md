---
title: History and Scroll
description: Configure Udodi Router history adapters, deployment base paths, history-entry identity, and scroll restoration.
---

# History and Scroll

Udodi Router separates route matching from the mechanism used to track navigation history. You can use standard browser URLs, hash-based URLs, or an in-memory history stack.

Scroll behavior is configured separately. It lets you restore a saved position when traversing browser history, scroll to a fragment target, or define a custom scrolling policy after navigation.

## History modes

Udodi Router provides three history adapters:

| Adapter | URL style | Use case |
| --- | --- | --- |
| `createWebHistory()` | `/about` | Standard browser URLs using the HTML5 History API. |
| `createHashHistory()` | `/#/about` | Client-side routing when the server cannot provide route fallbacks. |
| `createMemoryHistory()` | No browser URL changes | Tests and environments without browser history. |

The default is HTML5 history. You only need to supply a history adapter when you want different behavior.

### HTML5 history

HTML5 history uses the browser's History API to manage navigation without a full document reload.

```js
import { createRouter } from "udodi-router";

const router = createRouter({
  routes,
});
```

A route such as `/about` appears as a normal pathname in the browser address bar.

**Deployment requirement:** Your web server must serve the application entry HTML for client-side routes. Otherwise, directly opening or refreshing `/about` may return a server-side 404 before Udodi Router starts.

Use this mode when your hosting environment supports the required fallback behavior.

### Hash history

Hash history stores the application route in the URL fragment:

```text
https://example.com/#/about
```

Configure it with `createHashHistory()`:

```js
import {
  createRouter,
  createHashHistory,
} from "udodi-router";

const router = createRouter({
  routes,
  history: createHashHistory(),
});
```

Because the route is stored in the fragment, the server receives the document pathname rather than the client-side route. This is useful when your hosting environment cannot rewrite arbitrary route requests to the application entry HTML.

The route can still contain a query string or its own fragment inside the hash-based URL.

### Memory history

Memory history keeps a history stack in memory without reading or changing the browser URL.

```js
import {
  createRouter,
  createMemoryHistory,
} from "udodi-router";

const router = createRouter({
  routes,
  history: createMemoryHistory({
    initial: "/dashboard",
  }),
});
```

The `initial` option sets the initial application-relative location. It defaults to `/`.

Memory history supports navigation and history traversal without requiring browser globals or browser events. This makes it useful for deterministic navigation tests and non-browser environments.

## Choosing and configuring a history adapter

A typical browser application can use the default HTML5 history. Select hash history when you need fragment-based routing, and memory history when browser URL management is not required.

The adapters expose the same general navigation operations: `push`, `replace`, `back`, `forward`, and `go`. The router uses this common interface regardless of the selected history mode.

When supplying a custom history adapter, pass it through the router's `history` option.

## Deployment base paths

Use the `base` option when your application is deployed below the domain root, such as `/app`.

```js
const router = createRouter({
  routes,
  base: "/app",
});
```

Keep route definitions application-relative:

```js
const routes = [
  { path: "/", component: Home },
  { path: "/about", component: About },
];
```

The intended browser URL for the About route is `/app/about`, while the application route remains `/about`.

A base path must be a pathname prefix. It must not contain a query string, hash fragment, or dot segments such as `.` and `..`.

### Using a custom browser history adapter

The browser adapters also accept a `base` option:

```js
import {
  createRouter,
  createWebHistory,
} from "udodi-router";

const base = "/app";

const router = createRouter({
  routes,
  base,
  history: createWebHistory({ base }),
});
```

Keep the router and browser history adapter configured consistently for a subpath deployment. The browser adapter translates between browser locations and application-relative locations; the router uses the base when interpreting navigation paths and constructing link destinations.

For hash history, the route remains inside the fragment, while the adapter's base describes the browser pathname under which the application is hosted.

See [Troubleshooting](./troubleshooting.md) if the initial URL, link destinations, and configured base do not agree.

## History-entry identity

Udodi Router assigns a stable key to each browser history entry. The key identifies an entry independently of its pathname.

This is important because the same pathname can appear in multiple history entries, and different entries can have different scroll positions.

The history adapters follow these rules:

- **Push:** Creates a new history entry with a new key.
- **Replace:** Reuses the current entry's key.
- **Back and Forward:** Revisit existing entries and their keys.

These keys are managed internally by the history adapter. Application code does not need to create or manage them.

## Scroll restoration

Configure `scrollBehavior` on `createRouter()` to control window scrolling after a successful navigation.

The callback receives three arguments:

| Argument | Description |
| --- | --- |
| `to` | The committed destination route state. |
| `from` | The previously committed route state, or `null` when there was no previous route. |
| `savedPosition` | A saved `{ top, left }` position for a history traversal, or `null` when no saved position is available. |

The router invokes the callback after the destination view has rendered. The callback can return a result synchronously or asynchronously.

### A practical scroll policy

A common policy restores saved positions during Back and Forward navigation, scrolls to a fragment target when one is present, and otherwise starts at the top of the page.

```js
const router = createRouter({
  routes,

  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }

    if (to.hash) {
      return {
        el: to.hash,
        top: 16,
      };
    }

    return { top: 0 };
  },
});
```

The `top: 16` offset leaves space above the fragment target, which can be useful when the page has a fixed header.

When a custom `scrollBehavior` is configured, the router sets the browser's native `history.scrollRestoration` to `"manual"` where supported. This prevents native restoration from racing with the router's policy. When the router is destroyed, the previous setting is restored.

Without a custom `scrollBehavior`, the router does not install this manual-restoration override.

## Scroll behavior return values

A scroll policy may return a position object or a value that leaves scrolling unchanged.

| Return value | Behavior |
| --- | --- |
| `{ top: 0 }` | Scroll to the top of the window. |
| `{ top: 400, left: 0 }` | Scroll to the specified window coordinates, in pixels. |
| `{ el: "#results" }` | Scroll the matching element into view. |
| `{ el: "#results", top: 16 }` | Scroll to the element's document position with a 16-pixel vertical offset. |
| `false`, `null`, or `undefined` | Leave the current scroll position unchanged. |

Without `el`, `top` and `left` are absolute window coordinates. When `el` is provided with a numeric `top`, that value is an offset from the element's document position. If `el` is provided without a numeric `top`, the router uses the element's `scrollIntoView()` behavior.

A missing element does not throw an error out of the post-navigation scroll path. When a selector cannot be resolved, the router falls back to the returned absolute position values.

### Hash targets

The `to.hash` value includes the leading `#`, so it can be used as a CSS ID selector when the fragment names an element:

```js
scrollBehavior(to, from, savedPosition) {
  if (savedPosition) {
    return savedPosition;
  }

  if (to.hash) {
    return {
      el: to.hash,
      top: 16,
    };
  }

  return { top: 0 };
}
```

The target must exist in the rendered document when the scroll behavior runs. If the target is inserted later by application-specific asynchronous rendering, coordinate scrolling with that rendering.

The router controls window scrolling. It does not automatically manage independently scrolling nested containers.

## Saved positions and history traversal

The router associates saved window coordinates with history-entry keys. During Back or Forward navigation, the saved position for the selected entry is passed as `savedPosition` to `scrollBehavior`, if a position was captured.

This allows the application to restore the user's previous position without treating every revisit to the same pathname as the same history entry.

Saved scroll positions are held in memory by the router instance. They are not persistent storage, so they should not be treated as a guarantee of scroll restoration across a full page reload.

When no saved position is available, `savedPosition` is `null`. Your policy can then choose to scroll to a hash target, reset the window position, or preserve the existing position.

## Scroll timing and failures

The router applies custom scroll behavior after the route-view rendering step. This allows the destination's normal view to be in place before the callback selects a fragment target.

A scroll behavior failure occurs after route state has been committed. It therefore does not roll back the successful navigation. The router reports a warning if the callback throws or rejects.

If a fragment target is missing because your application renders it later, handle that timing in application code rather than relying on repeated router scroll attempts.
