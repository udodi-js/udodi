---
title: Navigation
description: Navigate programmatically with Udodi Router and understand navigation results, redirects, cancellation, and failures.
---

# Navigation

Udodi Router provides methods for navigating between routes and traversing browser history. Navigation is transactional: the router prepares the destination before committing it as the active route.

## Navigation methods

| Method | Description | Return value |
| --- | --- | --- |
| `router.push(to)` | Navigate to a destination and add a history entry. | `Promise<NavigationResult>` |
| `router.replace(to)` | Navigate to a destination and replace the current history entry. | `Promise<NavigationResult>` |
| `router.back()` | Move to the previous history entry. | `undefined` |
| `router.forward()` | Move to the next history entry. | `undefined` |
| `router.go(delta)` | Move by a relative number of history entries. | `undefined` |

Use `push()` for ordinary navigation. Use `replace()` when the current entry should be replaced (for example after correcting a URL or completing a redirect without adding another entry).

```js
const result = await router.push("/about");

if (result.type === "completed") {
  console.log("Navigation completed.");
}
```

`back()`, `forward()`, and `go()` delegate to the configured history adapter. They do not return a navigation result or a promise. The resulting history traversal is processed by the router's navigation pipeline.

```js
router.back();
router.forward();
router.go(-2);
router.go(1);
```

For history adapters and their behavior, see [History and Scroll](./history-and-scroll.md).

## Navigation targets

`push()` and `replace()` accept either a string or a target object.

### String targets

A string target is an application-relative URL beginning with `/`. It may include a query string and a hash fragment.

```js
await router.push("/users/42");
await router.push("/search?q=udodi&page=2");
await router.push("/docs#installation");
```

The router normalizes the pathname while retaining the query string and hash.

Absolute URLs and protocol-relative URLs are not valid router targets. Use the router for internal application navigation; use ordinary anchors for external destinations.

### Object targets

Use an object when you want to construct the pathname, query, and hash separately.

```js
await router.push({
  path: "/search",
  query: {
    q: "udodi",
    page: 2,
    tags: ["router", "reactivity"],
  },
  hash: "results",
});
```

| Property | Description |
| --- | --- |
| `path` | Required application-relative pathname. |
| `query` | Optional object of query parameters. |
| `hash` | Optional fragment, with or without the leading `#`. |

The router serializes query values into a URL. Null and undefined values are omitted; array values produce repeated query keys.

Use `path` for the pathname itself. When using an object target, supply query parameters and the fragment through `query` and `hash` rather than embedding them in `path`.

### Query and hash behavior

The router keeps the pathname, query, and hash separate in committed route state:

```js
router.route.path;
router.route.fullPath;
router.route.query;
router.route.hash;
```

Repeated query keys are parsed using their last value in `router.route.query`. The serialized URL can still contain repeated keys.

For details about the committed route object, see [Route State](./route-state.md).

## Navigation results

`push()` and `replace()` resolve to a `NavigationResult`. The `type` property indicates how the navigation ended.

| Result type | Meaning | Additional properties |
| --- | --- | --- |
| `completed` | The destination was committed successfully. | `route` |
| `cancelled` | Navigation did not complete (for example a guard cancelled it or a newer navigation superseded it). | — |
| `redirected` | A guard redirected navigation and the redirected destination completed. | `route`, `redirectTo` |
| `error` | Navigation failed during preparation or target resolution. | `error` |

The result is an object, not a boolean. Always check `type` before assuming that a navigation completed.

### Handling results

```js
const result = await router.push("/account/settings");

switch (result.type) {
  case "completed":
    console.log("Active route:", result.route.fullPath);
    break;

  case "cancelled":
    // The requested transition did not complete.
    break;

  case "redirected":
    console.log("Redirect destination:", result.redirectTo);
    console.log("Committed route:", result.route.fullPath);
    break;

  case "error":
    console.error("Navigation failed:", result.error);
    break;
}
```

A cancelled navigation is distinct from a failed navigation. Cancellation is a normal outcome when a guard blocks a transition or a newer navigation takes precedence.

## Transactional navigation

Udodi Router does not expose a destination as the active route before its preparation succeeds.

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
    │
    ├──► Render route views
    ├──► Apply document metadata
    └──► Apply scroll behavior
```

If preparation succeeds, the router commits the destination and updates the reactive route state.

If preparation is cancelled or fails, the destination is not committed. The previously committed route remains active.

Post-commit effects such as document metadata updates and scroll behavior do not turn an already committed navigation into a failed navigation.

## Cancellation and abort behavior

A navigation can be cancelled when a guard returns `false` or when a newer navigation supersedes an in-progress transition.

### A newer navigation supersedes the previous one

Starting another navigation aborts the previous navigation's internal signal.

```js
const first = router.push("/reports");
const second = router.push("/dashboard");

const [firstResult, secondResult] = await Promise.all([
  first,
  second,
]);
```

If the first navigation is still preparing when the second begins, the first returns a `cancelled` result. The second navigation proceeds independently and may complete, redirect, be cancelled, or fail.

The router checks whether a navigation is still current before committing, preventing an older asynchronous transition from overwriting a newer route.

### Signals in guards and loaders

Guards and loaders receive an `AbortSignal`. Pass it to abort-aware operations such as `fetch()` so that unnecessary work can stop when navigation is superseded.

```js
{
  path: "/users/:id",
  component: User,

  loader: async ({ params, signal }) => {
    const response = await fetch(
      `/api/users/${encodeURIComponent(params.id)}`,
      { signal },
    );

    if (!response.ok) {
      throw new Error("Unable to load user.");
    }

    return response.json();
  },
}
```

See [Guards and Loaders](./guards-and-loaders.md) for the complete guard and loader contracts.

Cancellation does not guarantee that arbitrary asynchronous work stops. Operations that support abort signals can stop cooperatively; other operations may continue running, but their stale navigation cannot commit.

## Redirects

A route guard can redirect a navigation by returning a string target or an object target containing `path`.

```js
{
  path: "/account/settings",
  component: Settings,

  beforeEnter: ({ context }) => {
    if (!context.isAuthenticated()) {
      return {
        path: "/login",
        query: {
          redirect: "/account/settings",
        },
      };
    }

    return true;
  },
}
```

When a guard redirects, Udodi Router prepares the redirected destination through the navigation pipeline. The original request resolves with `type: "redirected"` when the redirected destination completes successfully.

Redirects preserve the original history intent. A redirect from a `push()` navigation does not automatically become a `replace()` navigation. Redirects during initial navigation or history traversal replace the selected entry with the final destination.

See [Guards and Loaders](./guards-and-loaders.md) for guard return values and authentication patterns.

### Redirect loops

Redirects can form a loop if routes continually redirect to one another.

Udodi Router detects repeated redirect targets and limits the redirect chain. If a loop or excessive redirect chain is detected, navigation returns an `error` result rather than continuing indefinitely.

When debugging redirects, inspect the guard conditions and ensure that the redirected destination can eventually proceed without redirecting back to a previously visited target.

## Handling failures

A navigation can fail when the target is invalid, no route matches, a guard or loader throws, lazy component resolution fails, or metadata preparation fails.

```js
const result = await router.push("/users/unknown");

if (result.type === "error") {
  console.error(result.error);
}
```

The router also exposes the latest navigation error through `router.route.error`. A new navigation attempt clears that error; a successful commit clears it as well.

A failure during preparation leaves the previously committed route active. For failures involving guards, loader data, and component loading, see the relevant dedicated guide.

## Initial navigation

The router begins resolving the current URL when it is created. Use `router.ready` when application code needs the result of that initial navigation attempt.

```js
const router = createRouter({ routes });

const initialResult = await router.ready;

if (initialResult.type === "error") {
  console.error(
    "Initial navigation failed:",
    initialResult.error,
  );
}
```

`router.ready` resolves once with the initial navigation result. It is not a promise for every subsequent navigation. Use the promise returned by `push()` or `replace()` to inspect those results.
