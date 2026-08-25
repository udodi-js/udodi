# Invalidation

Invalidation marks a query as stale so that a later execution plan does not treat its cached result as fresh.

It is primarily used when the client knows that server data may have changed, especially after a successful mutation. Invalidation does not execute the query by itself. It changes the cache's freshness state so that the next plan can decide to re-execute it.

Invalidation is distinct from:

- **TTL expiry**: freshness becomes invalid because the configured TTL has elapsed.
- **`force`**: requests execution for a plan without relying on cache freshness.
- **`setQueryData()`**: updates query data directly without executing the query source.
- **`reset()`**: clears the query's state and cache.

The main flow is:

```text
invalidate()
     │
     ▼
query becomes stale
     │
     │
     └── no execution
             │
             ▼
      later execution plan
             │
             ▼
       query re-executes
```

For cache freshness and TTL behavior, see [Caching](./caching.md). For dependency relationships and dependent refreshes, see [Query Dependencies](./dependencies.md). For execution planning, force, and in-flight reuse, see [Query Scheduling](./scheduling.md).

---

## What Invalidation Does

Calling `invalidate()` marks the query's cached result as stale.

It does not immediately execute the query and does not discard the current result.

```js
users.invalidate();

console.log(users.data);   // previous data is still available
console.log(users.status); // status is not reset
```

The important distinction is that **staleness** and **query state** are separate. A query can retain its previous successful data while its cache entry is stale.

This allows the UI to continue displaying the last known result while a later plan obtains fresh data.

```text
            invalidate()
                  │
                  ▼
            cache → stale
                  │
                  │
            no execution
                  │
                  ▼
        fetch / refresh / plan
                  │
                  ▼
            execute query
                  │
                  ▼
          commit new result
```

If caching is not configured, there is no TTL cache entry to invalidate. The query can still be targeted by invalidation and subsequent execution planning, but there is no cached result that can provide a fresh-cache short circuit.

---

## Manual Invalidation

Use `invalidate()` when application code knows that a query's server-side data may no longer be current.

```js
const users = pool.query("users", {
  source: fetchUsers,
  cache: { ttl: 60_000 },
});

await users.fetch();

// Some external operation changed the server data.
users.invalidate();

await users.refresh();
```

Typical sources of manual invalidation include:

- an external event such as a WebSocket notification
- a change made in another browser tab
- an administrative operation
- a write performed outside the Query Pool
- application logic that knows a previously fetched result is no longer authoritative

Invalidation is useful when you want to separate **declaring data stale** from **deciding when to refresh** it.

---

## Mutation Invalidation

Mutations can declare queries that should be invalidated after a **successful** mutation.

```js
const createUser = pool.mutation("createUser", {
  execute: createUserRequest,
  invalidates: ["users"],
});

await createUser.mutate({ name: "Ada" });
```

The mutation first completes its write successfully. The declared invalidation targets are then processed and their refreshes are scheduled according to the mutation's invalidation options.

```text
mutate()
   │
   ▼
execute mutation
   │
   ▼
success
   │
   ├── onSuccess
   │
   └── invalidation phase
          │
          ├── mark target stale
          │
          └── schedule refresh
```

This makes `invalidates` particularly useful for maintaining server-derived query data after writes.

A **failed** mutation does not perform its normal successful invalidation phase because the server write did not complete successfully.

Refresh failures during the invalidation phase are handled so they do not rewrite the mutation’s own success: the write already completed. See [Mutations](./mutations.md).

---

## Skipping or Awaiting Invalidations

Mutation calls can control how invalidation processing is handled:

| Option | Default | Effect |
| --- | --- | --- |
| `skipInvalidation` | `false` | Skips processing of the mutation's `invalidates` targets. |
| `awaitInvalidations` | `true` | When enabled, the mutation waits for its invalidation refreshes to settle. |
| `force` | `false` | Requests forced execution for invalidation refreshes where applicable. |

For example:

```js
await createUser.mutate(input, {
  skipInvalidation: true,
});
```

This is useful when the caller intends to handle refreshes separately.

To allow the mutation to resolve without waiting for invalidation refreshes:

```js
await createUser.mutate(input, {
  awaitInvalidations: false,
});
```

The mutation's successful write and the subsequent query refreshes are therefore separate operations. `awaitInvalidations` controls whether those refreshes are part of the mutation's awaited completion.

---

## Invalidation Descriptors

The `invalidates` option accepts query keys or descriptors.

The shorthand form:

```js
invalidates: ["users"],
```

targets a single query.

A descriptor provides additional control:

```js
invalidates: [
  {
    key: "users",
    dependents: true,
    force: false,
  },
],
```

The descriptor fields are:

| Field | Purpose |
| --- | --- |
| `key` | Query to invalidate and refresh. |
| `dependents` | Includes reverse dependents in the refresh plan. |
| `force` | Requests forced execution when the invalidation refresh is scheduled. |

The descriptor form is useful when invalidating one query should also cause queries that depend on it to be refreshed.

For example:

```text
users
  │
  ├── userCount
  └── userPosts
```

```js
invalidates: [
  {
    key: "users",
    dependents: true,
  },
]
```

The invalidation targets `users`. The refresh plan can then include `users` and its reverse dependents.

See [Query Dependencies](./dependencies.md) for how dependency edges and dependent expansion work.

---

## Invalidation and Dependents

Invalidating a query does not automatically mean that every dependent query is executed.

Dependent expansion is a property of the **refresh plan**.

For example:

```js
users.invalidate();

await users.refresh({
  dependents: true,
});
```

Here, `users` is marked stale first. The subsequent refresh plan includes its reverse dependents.

Mutation invalidation can request the same behavior directly:

```js
const createUser = pool.mutation("createUser", {
  execute: createUserRequest,

  invalidates: [
    {
      key: "users",
      dependents: true,
    },
  ],
});
```

Without `dependents: true`, the invalidation targets only the specified query. Dependent queries retain their own cache state until they are explicitly targeted or included by another execution plan.

This distinction is important:

```text
invalidate users
       │
       ▼
users becomes stale

       │
       │ dependents: false
       ▼
refresh users only

       │
       │ dependents: true
       ▼
refresh plan includes
users + reverse dependents
```

---

## Invalidation vs TTL vs force

These mechanisms affect query execution in different ways:

| Mechanism | Changes freshness | Executes immediately | Typical use |
| --- | --- | --- | --- |
| TTL expiry | Yes, by making cached data no longer fresh | No | Time-based cache freshness |
| `invalidate()` | Yes, explicitly marks the query stale | No | Known or suspected server-side change |
| Mutation `invalidates` | Yes, then schedules refresh | Yes, through the invalidation refresh plan | Refresh after a successful write |
| `force: true` | Not required | Yes, as part of the execution plan | Explicitly bypass freshness short-circuits |

A useful mental model is:

```text
TTL
    wait until cached data is no longer fresh

invalidate()
    declare cached data stale

mutation invalidates
    declare stale + schedule refresh

force
    execute without relying on freshness
```

`invalidate()` therefore does not mean "fetch now." It means "do not consider this cached result fresh for a subsequent plan."

---

## Optimistic Updates and Invalidation

Invalidation works naturally with optimistic updates.

A mutation can first update query data for immediate UI feedback, then perform the server write, and finally invalidate the affected query so that authoritative server data can replace the optimistic result.

```js
const createUser = pool.mutation("createUser", {
  execute: createUserRequest,

  onMutate(input, ctx) {
    const previous = ctx.getQueryData("users") ?? [];

    ctx.setQueryData("users", [
      ...previous,
      { id: `temp-${Date.now()}`, ...input },
    ]);

    return { previous };
  },

  onError(_error, _input, ctx) {
    if (ctx.previous) {
      ctx.setQueryData("users", ctx.previous);
    }
  },

  invalidates: ["users"],
});
```

The sequence is:

```text
setQueryData()
      │
      ▼
optimistic UI
      │
      ▼
execute mutation
      │
      ├── failure ──► rollback
      │
      └── success
             │
             ▼
      invalidate users
             │
             ▼
       refresh users
             │
             ▼
      server-authoritative data
```

`setQueryData()` and invalidation serve different purposes. The former changes the currently exposed query data; the latter ensures that a later execution plan does not continue treating the cached result as authoritative.

See [Mutations](./mutations.md) for the full mutation context API (`getQueryData`, `setQueryData`, hooks).

---

## What Invalidation Does Not Do

Invalidation does not:

- clear `data`
- reset the query status
- cancel an in-flight execution
- execute the query immediately when called directly
- transform or merge query results
- invalidate mutations
- persist across Query Pool instances or page reloads

Use the operation that corresponds to the required behavior:

```js
users.invalidate(); // mark the query stale
users.cancel();     // cancel an in-flight execution
users.reset();      // clear query state and cache
```

For directly replacing query data, use `setQueryData()`.

---

## Complete Example

```js
import { createQueryPool } from "udodi";

const pool = createQueryPool();

const users = pool.query("users", {
  source: async (signal) => {
    const response = await fetch("/api/users", { signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },

  cache: {
    ttl: 60_000,
  },
});

const userCount = pool.query("userCount", {
  dependsOn: ["users"],

  source: () => {
    return (pool.data("users") ?? []).length;
  },
});

const createUser = pool.mutation("createUser", {
  execute: async (input, { signal }) => {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },

  invalidates: [
    {
      key: "users",
      dependents: true,
    },
  ],
});

await users.fetch();

await createUser.mutate({
  name: "Ada",
});
```

After the mutation succeeds, `users` is invalidated and its refresh plan includes its reverse dependents. Because `userCount` depends on `users`, it can participate in that dependent refresh plan.

The important sequence is:

```text
users.fetch()
    │
    ▼
fresh users data
    │
    ▼
createUser.mutate()
    │
    ▼
server write succeeds
    │
    ▼
invalidate users
    │
    ▼
refresh plan
    │
    ├── users
    │
    └── userCount
          │
          ▼
     fresh derived data
```

---

## API Summary

| Surface | Role |
| --- | --- |
| `query.invalidate()` | Marks the query stale without executing it. |
| `invalidates` | Declares queries to invalidate after a successful mutation. |
| `invalidates: string[]` | Shorthand for targeting query keys. |
| Descriptor `key` | Identifies the query to invalidate. |
| Descriptor `dependents` | Includes reverse dependents in the refresh plan. |
| Descriptor `force` | Requests forced execution during invalidation refresh. |
| `skipInvalidation` | Skips mutation invalidation processing. |
| `awaitInvalidations` | Controls whether mutation completion waits for invalidation refreshes. |
| `setQueryData()` | Updates query data directly without executing the query. |
| `reset()` | Clears query state and cache. |
| `cancel()` | Cancels an in-flight execution. |

---

## Next Steps

| Topic | Guide |
| --- | --- |
| TTL and cache freshness | [Caching](./caching.md) |
| Optimistic updates and mutations | [Mutations](./mutations.md) |
| Query dependencies and dependents | [Query Dependencies](./dependencies.md) |
| Execution plans, force, and in-flight reuse | [Query Scheduling](./scheduling.md) |
| Query state and preserved data | [Query Lifecycle](./lifecycle.md) |
| Creating and configuring queries | [Queries](./queries.md) |
| Query Pool architecture | [Query Pool Overview](./overview.md) |
| API signatures | [Query Pool API Reference](../api/query-pool.md) |
