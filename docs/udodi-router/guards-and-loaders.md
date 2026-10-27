---
title: Guards and Loaders
description: Control route transitions, redirect navigation, load route data, and handle cancellation with Udodi Router.
---

# Guards and Loaders

Udodi Router provides two route-record options for controlling navigation and preparing data:

- **`beforeEnter`** determines whether a matched route can proceed, should be cancelled, or should redirect elsewhere.
- **`loader`** asynchronously prepares data for a matched route before the destination is committed.

Both participate in transactional navigation. The router does not expose a destination as the active route until its required preparation succeeds.

## Navigation pipeline

For a matched destination, the router prepares the route in this order:

```text
Match route
    │
    ▼
Run guards
    │
    ▼
Run loaders (parent → child)
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

A cancelled guard stops the transition before loaders run. A redirect starts preparation for the redirected destination. A loader or component-resolution failure prevents the destination from being committed.

See [Navigation](./navigation.md) for the complete navigation result types, history behavior, and redirect handling.

## Route guards

Define a guard using `beforeEnter` on a route record:

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

A guard may be synchronous or asynchronous. Udodi Router awaits its result before proceeding.

### Guard context

`beforeEnter` receives an object with these properties:

| Property | Description |
| --- | --- |
| `to` | Proposed destination route, including its path, parameters, query, hash, and matched records. |
| `from` | Previously committed route snapshot, or `null` when there is no previous route. |
| `signal` | `AbortSignal` for the current navigation. |
| `context` | Shared application context supplied through `createRouter({ context })`. |

Use `to` to inspect the proposed destination and `from` to inspect where navigation started. The destination is not yet committed when the guard runs.

The shared `context` is useful for passing services or request-independent application dependencies into route logic without importing them directly into every guard and loader.

### Guard return values

A guard must return one of the supported outcomes.

| Return value | Behavior |
| --- | --- |
| `true` | Allow the guard to finish and continue to the next guard or preparation stage. |
| `undefined` | Same as `true`. |
| `false` | Cancel the current navigation. |
| A string target | Redirect to that target. |
| An object with a string `path` | Redirect to that target, optionally including `query` and `hash`. |
| A thrown error or rejected promise | Fail navigation. |

An asynchronous guard can check an application service before allowing entry:

```js
{
  path: "/admin",
  component: Admin,
  beforeEnter: async ({ context, signal }) => {
    const allowed = await context.permissions.canAccessAdmin({
      signal,
    });

    if (!allowed) {
      return { path: "/forbidden" };
    }

    return true;
  },
}
```

The `context.permissions` service in this example is application-provided; Udodi Router does not supply an authentication or permission service automatically.

### Redirect instead of starting another navigation

Return a target from the guard when redirecting. This lets the router handle the redirect within the current navigation transaction.

```js
beforeEnter: ({ context }) => {
  if (!context.isAuthenticated()) {
    return {
      path: "/login",
      query: { redirect: "/account" },
    };
  }

  return true;
},
```

The router prepares the redirected destination and resolves the original navigation with the appropriate result. A guard that returns `false` cancels navigation instead.

For redirect loops, result handling, and history semantics, see [Navigation](./navigation.md).

### Guard execution order

Guards run sequentially from parent to child along the destination's matched route chain. A guard that cancels or redirects stops the remaining guards in that chain from running for that destination.

This lets a parent route enforce a shared condition before its child routes proceed.

```js
const routes = [
  {
    path: "/account",
    component: AccountLayout,

    beforeEnter: ({ context }) => {
      if (!context.isAuthenticated()) {
        return "/login";
      }
    },

    children: [
      { path: "", component: AccountHome },
      { path: "settings", component: Settings },
    ],
  },
];
```

The parent guard runs before the matched child guard, if one is defined.

Guards are client-side navigation controls, not a security boundary. Protect sensitive data and operations with authorization on the server as well.

## Route loaders

A loader prepares data for a route before the router commits the destination.

```js
{
  path: "/posts/:id",
  component: Post,

  loader: async ({ params, signal }) => {
    const response = await fetch(
      `/api/posts/${encodeURIComponent(params.id)}`,
      { signal },
    );

    if (!response.ok) {
      throw new Error("Unable to load post.");
    }

    return response.json();
  },
}
```

The router awaits the loader and associates its result with the route record. If the loader throws or rejects, the navigation fails and the previously committed route remains active.

### Loader arguments

Every loader receives an object containing:

| Property | Description |
| --- | --- |
| `params` | Decoded route parameters. |
| `query` | Decoded query parameters, represented as strings. |
| `signal` | `AbortSignal` for the current navigation. |
| `context` | Shared application context supplied through the router options. |

The loader's return value becomes that route record's data. A loader can return any value appropriate for the application, including an object, array, primitive, or promise result.

### Loaders run parent to child

For a nested route, the router runs loaders sequentially in matched parent-to-child order. A record without a loader contributes no loader result of its own.

```js
const routes = [
  {
    path: "/projects/:projectId",
    component: ProjectLayout,

    loader: async ({ params, signal }) => {
      return fetchProject(params.projectId, signal);
    },

    children: [
      {
        path: "tasks",
        component: TaskList,

        loader: async ({ params, query, signal }) => {
          return fetchTasks(params.projectId, query, signal);
        },
      },
    ],
  },
];
```

Here, the project loader completes before the task-list loader begins.

Each loader receives `params`, `query`, `signal`, and `context`. Previous loaders' return values are not automatically passed as arguments to subsequent loaders. Use a shared service in `context` when data must be coordinated explicitly, or use the matched route data after the route has been committed.

See [Nested Routes](./nested-routes.md) for route hierarchy and outlet composition.

## Reading loader data

After a successful navigation, loader results are available through the committed route state.

### Active leaf data

`router.route.data` contains the loader result for the active leaf route.

```js
const post = router.route.data;
```

This is convenient when a page component needs the data prepared for its own route.

```js
const Post = createComponent({
  name: "Post",

  state() {
    return {
      title: "Loading post...",
    };
  },

  onMount(root, ctx) {
    const stop = effect(() => {
      ctx.title = router.route.data?.title ?? "Loading post...";
    });

    ctx.cleanup(stop);
  },

  template: html`
    <article>
      <h1 @text="title"></h1>
    </article>
  `,
});
```

This example reads committed data reactively. During navigation preparation, `router.route.data` continues to describe the previously committed route.

### Data for individual matched records

For nested routes, each entry in `router.route.matched` includes the loader data associated with that route record.

Use this when application code needs data belonging to a parent record rather than the active leaf:

```js
const matched = router.route.matched;

for (const entry of matched) {
  console.log(entry.record.path, entry.data);
}
```

The matched entries are ordered from parent to child. Their `data` values correspond to the route records, allowing parent layouts and child views to consume different results.

See [Route State](./route-state.md) for the complete reactive route object.

## Loader data and metadata

Route metadata can depend on the result of its own loader. The router resolves metadata after loaders and lazy components have been prepared.

```js
{
  path: "/posts/:id",
  component: Post,

  loader: async ({ params, signal }) => {
    return fetchPost(params.id, signal);
  },

  meta: ({ params, data }) => ({
    title: data?.title ?? `Post ${params.id}`,
    description: data?.excerpt ?? "Read this post.",
  }),
}
```

The metadata callback receives `params` and the loader result associated with that record as `data`. It can also use the route metadata callback's supported context and route information.

See [Metadata](./metadata.md) for metadata inheritance, supported fields, and dynamic metadata resolution.

## Cancellation and abort signals

A navigation can be cancelled when a guard returns `false` or when a newer navigation supersedes the current transition.

The router supplies an `AbortSignal` to guards and loaders. Pass it to APIs that support cancellation, such as `fetch()`:

```js
loader: async ({ params, signal }) => {
  const response = await fetch(
    `/api/items/${encodeURIComponent(params.id)}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error("Unable to load item.");
  }

  return response.json();
},
```

When the navigation is aborted, an abort-aware operation can stop its work. The router also checks whether the navigation is still current before committing, so an older asynchronous transition cannot replace a newer committed route.

Cancellation is not the same as a loader failure. Operations that do not support abort signals may continue running, even though their stale navigation cannot commit.

## Handling loader errors

Throw an error when a loader cannot produce valid data:

```js
loader: async ({ params, signal }) => {
  const response = await fetch(
    `/api/users/${encodeURIComponent(params.id)}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error(`Unable to load user ${params.id}.`);
  }

  return response.json();
},
```

A thrown or rejected loader fails navigation. The router returns an `error` navigation result, stores the error in `router.route.error`, and leaves the previously committed route active.

Handle the navigation result at the call site when the application needs to react directly to the failure:

```js
const result = await router.push("/users/42");

if (result.type === "error") {
  console.error("Navigation failed:", result.error);
}
```

A cancelled navigation instead resolves with `type: "cancelled"`. Avoid treating all non-completed navigation results as exceptions.

See [Navigation](./navigation.md) for result types and failure behavior, and [Troubleshooting](./troubleshooting.md) for common loader and routing issues.
