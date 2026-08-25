# Query Lifecycle

Every query in a Query Pool has a small, predictable lifecycle.

The query's **status** describes the outcome or current phase of execution, while reactive fields such as `data`, `error`, `loading`, `streaming`, `streamed`, and `chunks` provide more detailed state for the UI.

This guide explains:

- lifecycle statuses and transitions
- reactive fields and their semantics
- starting and completing executions
- success and error handling
- cancellation and superseded runs
- `cancel()` vs `reset()`
- streaming lifecycle
- cache short-circuiting
- initial execution after registration
- how mutation lifecycle relates to query lifecycle

For creating queries and using `fetch()` / `refresh()`, see [Queries](./queries.md).

For dependency execution and in-flight reuse, see [Query Dependencies](./dependencies.md) and [Query Scheduling](./scheduling.md).

For abort behavior, see [Query Cancellation](./cancellation.md).

---

## Lifecycle Status

A query's `status` is one of five values:

| Status | Meaning |
| --- | --- |
| `"idle"` | The query has not completed an execution, or it has been reset. |
| `"loading"` | An execution is currently in progress. |
| `"success"` | The latest completed execution succeeded. |
| `"error"` | The latest completed execution failed. |
| `"cancelled"` | The current execution was explicitly cancelled while loading. |

```js
const users = pool.query("users", {
  source: fetchUsers,
});

console.log(users.status);
// "idle" initially, then "loading", then "success" or "error"
```

The query handle is returned synchronously. Its initial execution starts asynchronously, so the handle can be observed immediately even though execution has not yet completed.

`status` is reactive. Reading it inside an effect, computed value, or template establishes a dependency on that field.

---

## Reactive Fields

A query exposes several reactive fields that describe its current execution state:

| Field | Meaning |
| --- | --- |
| `data` | The latest successful result. Previous data is preserved across errors and cancellation. |
| `error` | The latest execution error, or `null` when there is no current error. |
| `loading` | `true` while the query is executing. |
| `streaming` | `true` while a streaming worker execution is receiving chunks. |
| `streamed` | `true` after at least one chunk has been received during the current run. |
| `chunks` | Chunks received during the current streaming run. |
| `status` | Current lifecycle status. |

The fields are independent but coordinated.

For example, a query can have:

- `status = "error"`
- `loading = false`
- `data = previous successful result`
- `error = current error`

This is intentional. A failed refresh does not require the UI to discard data that was already successfully loaded.

### Reactive UI Example

```js
const message = computed(() => {
  if (users.loading) {
    return "Loading users...";
  }

  if (users.error) {
    return "Unable to load users.";
  }

  if (users.status === "cancelled") {
    return "Loading was cancelled.";
  }

  return `${(users.data ?? []).length} users`;
});
```

There is normally no need to copy `loading`, `error`, or `status` into component state.

The query handle itself is reactive.

---

## The Basic Lifecycle

The normal lifecycle is:

```text
               ┌───────────┐
               │   idle    │
               └─────┬─────┘
                     │
               start execution
                     │
                     ▼
               ┌───────────┐
               │  loading  │
               └─────┬─────┘
                     │
          ┌──────────┼───────────┐
          │          │           │
       success     error      cancel()
          │          │           │
          ▼          ▼           ▼
     ┌─────────┐ ┌───────┐ ┌───────────┐
     │ success │ │ error │ │ cancelled │
     └────┬────┘ └───┬───┘ └─────┬─────┘
          │          │           │
          └──────────┼───────────┘
                     │
                  reset()
                     │
                     ▼
               ┌───────────┐
               │   idle    │
               └───────────┘
```

A new execution from `success`, `error`, or `cancelled` goes through `"loading"` again.

`reset()` is the operation that returns the query to `"idle"` while clearing its execution state.

---

## Starting an Execution

A query can start execution through several paths:

- initial registration with `pool.query()`
- `query.fetch()`
- `query.refresh()`
- `pool.refresh(key)`
- dependency-plan execution
- a forced execution

At the beginning of an actual run, the query establishes a new execution identity and prepares its reactive state.

Conceptually:

```text
start run
    │
    ├── supersede previous run
    ├── create AbortController
    ├── loading = true
    ├── status = "loading"
    ├── error = null
    ├── chunks = []
    └── streamed = false
            │
            ▼
      source / module
```

The query uses an internal execution **ID** so that results belonging to an older run cannot overwrite the state of a newer run.

### Example

```js
const users = pool.query("users", {
  source: async (signal) => {
    const response = await fetch("/api/users", {
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },
});
```

Once execution starts:

```js
users.loading; // true
users.status;  // "loading"
users.error;   // null
```

When the execution completes successfully:

```js
users.loading; // false
users.status;  // "success"
users.data;    // fetched users
```

---

## In-Flight Deduplication

Starting an execution does not necessarily mean starting new asynchronous work.

If the query already has an active execution and the new execution is not forced, the existing in-flight work can be reused.

Conceptually:

```text
    request A
        │
        ▼
┌───────────────┐
│ active promise│
└───────┬───────┘
        │
        ├──────── request B
        │              │
        │              ▼
        │        reuse same work
        │
        ▼
     resolve
```

This prevents multiple callers from unnecessarily executing the same query concurrently.

For example:

```js
const first = users.fetch();
const second = users.fetch();

await Promise.all([first, second]);
```

The pool can reuse the active execution rather than treating both calls as independent pieces of work.

Use `force` when a new execution must supersede the existing in-flight work.

See [Query Scheduling](./scheduling.md) for the complete execution and deduplication model.

---

## Success

When the current executor resolves successfully, the query commits the result.

The lifecycle is:

1. The result is accepted only if the execution is still current.
2. The cache is updated when caching is configured.
3. `data` is replaced with the successful result.
4. `error` becomes `null`.
5. `loading` becomes `false`.
6. `streaming` becomes `false`.
7. `status` becomes `"success"`.
8. The execution's abort controller is released.

```text
loading
   │
   │ executor resolves
   ▼
data = result
error = null
loading = false
streaming = false
status = "success"
```

### Previous Data

A successful execution replaces the previous data:

```js
// Previous
users.data;
// [{ id: 1, name: "Ada" }]

// Successful refresh
await users.refresh();

// New
users.data;
// [{ id: 1, name: "Ada" }, { id: 2, name: "Grace" }]
```

The important rule is that only a successful result replaces query data during normal execution.

---

## Error

If the current execution rejects and has not been superseded or cancelled:

1. `loading` becomes `false`.
2. `streaming` becomes `false`.
3. `error` is set to the thrown value.
4. `status` becomes `"error"`.
5. Existing data is preserved.

```text
loading
   │
   │ executor rejects
   ▼
error = thrown value
loading = false
streaming = false
status = "error"
data = previous value
```

### Keeping Previous Data

This allows a refresh failure to preserve useful UI data:

```js
const users = pool.query("users", {
  source: fetchUsers,
});
```

Suppose the first execution succeeds:

```js
users.data;
// [{ id: 1, name: "Ada" }]
```

A later refresh fails:

```js
await users.refresh();
```

The resulting state can be:

```js
users.status; // "error"
users.error;  // Error(...)
users.data;   // [{ id: 1, name: "Ada" }]
```

This is useful for interfaces that should display stale-but-known data together with an error indicator rather than replacing the entire view with an empty state.

### Dependency Errors

When a dependency fails, dependent execution is represented using `QueryDependencyError` so the execution plan can preserve the root query's original error where appropriate.

See [Query Dependencies](./dependencies.md).

---

## Cancellation

Calling `cancel()` explicitly stops the current execution.

The cancellation path:

1. Supersedes the current execution id.
2. Aborts the current `AbortController`.
3. Clears the in-flight execution.
4. Sets `loading = false`.
5. Sets `streaming = false`.
6. Sets `status = "cancelled"` when the query was loading.
7. Preserves existing data.

```text
      loading
         │
         │ cancel()
         ▼
┌─────────────────┐
│    cancelled    │
│                 │
│ loading=false   │
│ streaming=false |
│ data preserved  │
└─────────────────┘
```

### Example

```js
const users = pool.query("users", {
  source: async (signal) => {
    const response = await fetch("/api/users", {
      signal,
    });

    return response.json();
  },
});

const promise = users.fetch();

users.cancel();

console.log(users.loading); // false
console.log(users.status);  // "cancelled"

await promise;
```

The underlying source should always use the supplied signal when the operation supports cancellation:

```js
source: async (signal) => {
  const response = await fetch("/api/users", {
    signal,
  });

  return response.json();
}
```

See [Query Cancellation](./cancellation.md).

---

## Superseded Executions

A query can also have an execution superseded by a newer execution.

This is different from an explicit `cancel()`.

For example:

```js
await users.fetch({
  force: true,
});
```

If an older execution is still active, the newer execution becomes the current execution. The older execution's eventual result is ignored.

The important invariant is:

> Only the current execution may commit query state.

This prevents a slower, older request from overwriting the result of a newer request.

```text
Execution A
    │
    │ running
    │
    ├───────────────┐
    │               │
    ▼               │
Execution B         │
(force)             │
    │               │
    ▼               │
current execution   │
    │               │
    ▼               │
commit result       │
                    │
       Execution A resolves later
                    │
                    ▼
              ignored as stale
```

A forced execution therefore provides latest-run-wins protection rather than exposing the superseded execution as a separate visible lifecycle.

---

## Reset

`reset()` is stronger than `cancel()`.

It cancels active work and clears the query's accumulated execution state.

`reset()`:

1. Cancels any in-flight execution.
2. Clears cached query data.
3. Clears cached input.
4. Clears `data`.
5. Clears `error`.
6. Clears `chunks`.
7. Sets `loading = false`.
8. Sets `streaming = false`.
9. Sets `streamed = false`.
10. Sets `status = "idle"`.

```text
cancel()
   │
   ├── stop execution
   ├── preserve data
   └── status → "cancelled"

reset()
   │
   ├── stop execution
   ├── clear data
   ├── clear cache
   ├── clear input
   ├── clear chunks
   ├── clear error
   └── status → "idle"
```

### When to Use Each

Use `cancel()` when:

> "Stop this work, but keep the last successful result."

Use `reset()` when:

> "Forget the query's current state and make it behave as though it has not run."

For example, when leaving a feature completely:

```js
users.reset();

console.log(users.status); // "idle"
console.log(users.data);   // undefined
console.log(users.error);  // null
```

---

## Streaming Lifecycle

Streaming applies to worker-module queries configured with:

```js
stream: true
```

A streaming query has two related concepts:

- `loading` — the complete execution is still active.
- `streaming` — the worker stream is currently open.

When a stream starts:

```js
query.loading;   // true
query.streaming; // true
query.streamed;  // false
query.chunks;    // []
```

When the first chunk arrives:

```js
query.streamed;  // true
query.chunks;    // [firstChunk]
```

Additional chunks accumulate:

```text
execution starts
       │
       ▼
loading = true
streaming = true
streamed = false
chunks = []
       │
       ├── chunk ──► chunks
       │             streamed = true
       │
       ├── chunk ──► chunks
       │
       ├── chunk ──► chunks
       │
       ▼
stream ends
       │
       ▼
streaming = false
       │
       ▼
execution completes
       │
       ▼
success / error / cancelled
```

### Example

```js
pool.registerModule("generateReport", {
  url: new URL(
    "./workers/generate-report.js",
    import.meta.url,
  ).href,
});

const report = pool.query("report", {
  module: "generateReport",
  stream: true,
});
```

A UI can react to the accumulated chunks:

```js
const progress = computed(() => {
  if (!report.loading) {
    return "Finished";
  }

  return `${report.chunks.length} chunks received`;
});
```

A new execution clears the chunks from the previous run:

```text
new run
  │
  ├── chunks = []
  └── streamed = false
```

Chunks belonging to an older, superseded execution are ignored.

See [Query Pool and Workers](./workers.md) and [Transferable Data](./transfers.md).

---

## Cache and Lifecycle

Caching can cause an execution to complete without calling the query's `source` or worker module.

When a configured cache entry is still fresh and the execution is not forced:

```text
                query execution
                       │
                       ▼
                cache available?
                  /         \
                no           yes
                │             │
                ▼             ▼
             execute      cache fresh?
                              /    \
                            no      yes
                            │        │
                            ▼        ▼
                         execute   use cached
                                      │
                                      ▼
                                status = success
```

A fresh cache hit can:

- restore `data` from the cache
- clear `error`
- set `loading = false`
- set `streaming = false`
- set `status = "success"`
- avoid calling `source` or the worker module

For example:

```js
const users = pool.query("users", {
  source: fetchUsers,

  cache: {
    ttl: 60_000,
  },
});
```

If the cached result is still fresh:

```js
await users.refresh();
```

the query can reuse the cached result instead of executing `fetchUsers()` again.

### Invalidating Cache

`invalidate()` does not execute the query.

It only marks the cache entry stale:

```js
users.invalidate();

console.log(users.status);
// Current lifecycle status is unchanged.
```

A later execution that needs fresh data will execute the query again.

This distinction is important:

```text
invalidate()
     │
     ▼
cache becomes stale
     │
     │ no execution yet
     ▼
later fetch / refresh
     │
     ▼
query executes
```

See [Caching](./caching.md) and [Invalidation](./invalidation.md).

---

## Initial Registration

Registering a query returns its handle synchronously:

```js
const users = pool.query("users", {
  source: fetchUsers,
});
```

The registration call itself does not require awaiting the initial execution.

Conceptually:

```text
pool.query("users", definition)
          │
          ├──────────────► returns handle
          │                 status = "idle"
          │
          └──────────────► starts initial plan asynchronously
                                  │
                                  ▼
                               loading
                                  │
                            ┌─────┴─────┐
                            ▼           ▼
                         success      error
```

The initial plan includes dependencies when the query has `dependsOn`.

For example:

```js
const profile = pool.query("profile", {
  dependsOn: ["session"],

  source: async () => {
    return fetchProfile(pool.data("session"));
  },
});
```

The dependency plan executes upstream work before the dependent query.

### Registration Errors

Failures from the initial execution plan are handled asynchronously rather than causing `pool.query()` itself to reject.

Therefore:

```js
const users = pool.query("users", {
  source: async () => {
    throw new Error("Network failure");
  },
});
```

still returns a query handle.

The eventual failure is represented through:

```js
users.status; // "error"
users.error;  // Error("Network failure")
```

This makes query registration synchronous while execution remains asynchronous.

---

## Query Data Across Lifecycle Events

The most important data-preservation rule is:

> Errors and cancellation do not normally erase the last successful data.

Consider:

```text
successful request
      │
      ▼
data = [users]
status = "success"
      │
      │ refresh
      ▼
status = "loading"
      │
      ├── success ──► data replaced
      │
      ├── error ────► data preserved
      │
      └── cancel ───► data preserved
```

This makes stale-data interfaces straightforward:

```js
const users = pool.query("users", {
  source: fetchUsers,
});

const view = computed(() => {
  if (users.loading && !users.data) {
    return "Loading...";
  }

  if (users.error && users.data) {
    return "Showing previous data — refresh failed.";
  }

  if (users.error) {
    return "Unable to load users.";
  }

  return `Users: ${users.data?.length ?? 0}`;
});
```

The UI can therefore distinguish:

- no data yet
- loading with previous data
- successful data
- previous data with an error
- cancelled execution

without maintaining duplicate request state.

---

## Reactive Lifecycle Example

A query's lifecycle fields are ordinary reactive state from the perspective of consumers.

```js
const users = pool.query("users", {
  source: fetchUsers,
});

effect(() => {
  if (users.loading) {
    console.log("Loading...");
    return;
  }

  if (users.error) {
    console.error("Request failed:", users.error);
    return;
  }

  if (users.status === "success") {
    console.log("Loaded:", users.data);
  }
});
```

Only the reactive fields read by the computation become dependencies.

For example:

```js
const label = computed(() => {
  if (users.loading) {
    return "Loading...";
  }

  return `Users: ${users.data?.length ?? 0}`;
});
```

This computation depends on `loading` and `data`. It does not need to react to unrelated query fields simply because they changed.

---

## Mutation Lifecycle

Mutations use the same core status vocabulary:

- `idle`
- `loading`
- `success`
- `error`
- `cancelled`

They also expose lifecycle fields such as:

- `data`
- `variables`
- `error`
- `loading`
- `streaming`
- `streamed`
- `chunks`
- `status`

The major difference is how execution begins.

Queries can start during registration or through `fetch()` / `refresh()`:

```js
const users = pool.query("users", {
  source: fetchUsers,
});
```

Mutations begin explicitly through `mutate()`:

```js
const createUser = pool.mutation("createUser", {
  execute: async (input, { signal }) => {
    const response = await fetch("/api/users", {
      method: "POST",
      body: JSON.stringify(input),
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },
});

await createUser.mutate({
  name: "Ada",
});
```

Mutation lifecycle also includes hooks such as:

- `onMutate`
- `onSuccess`
- `onError`

and may invalidate or refresh queries after a successful mutation.

The mutation's own lifecycle is independent from the lifecycle of queries it invalidates.

For example:

```text
mutation
    │
    ▼
 loading
    │
    ▼
 success
    │
    ├── invalidate users
    │
    └── refresh users
             │
             ▼
       users: loading
             │
        ┌────┴────┐
        ▼         ▼
     success    error
```

A successful mutation does not mean that every invalidated query has also succeeded.

See [Mutations](./mutations.md) and [Invalidation](./invalidation.md).

---

## Lifecycle Summary

The query lifecycle can be summarized as:

```text
                         registration
                              │
                              ▼
                         ┌─────────┐
                         │  idle   │
                         └────┬────┘
                              │
                       start execution
                              │
                              ▼
                         ┌─────────┐
                         │ loading │
                         └────┬────┘
                              │
                  ┌───────────┼────────────┐
                  │           │            │
               success      error      cancel / abort
                  │           │            │
                  ▼           ▼            ▼
             ┌─────────┐ ┌─────────┐ ┌───────────┐
             │ success │ │  error  │ │ cancelled │
             └────┬────┘ └────┬────┘ └─────┬─────┘
                  │           │            │
                  └───────────┼────────────┘
                              │
                         new execution
                              │
                              ▼
                         ┌─────────┐
                         │ loading │
                         └─────────┘


             reset() from any lifecycle state
                              │
                              ▼
                         ┌─────────┐
                         │  idle   │
                         └─────────┘
```

The practical rules are:

1. `"idle"` means the query has no completed execution or has been reset.
2. `"loading"` means the current execution is active.
3. `"success"` means the latest completed execution succeeded.
4. `"error"` means the latest completed execution failed.
5. `"cancelled"` represents an explicitly cancelled loading execution.
6. `data` survives errors and cancellation.
7. `reset()` clears data, cache, input, and lifecycle state.
8. Only the current execution may commit results.
9. Fresh cache can satisfy execution without calling the source/module.
10. Streaming adds chunk-level state without changing the core lifecycle model.

---

## Next Steps

| Topic | Guide |
| --- | --- |
| Create queries and use `fetch()` / `refresh()` | [Queries](./queries.md) |
| Abort in-flight work | [Query Cancellation](./cancellation.md) |
| Build dependency graphs | [Query Dependencies](./dependencies.md) |
| Understand execution order and in-flight reuse | [Query Scheduling](./scheduling.md) |
| Configure TTL and cache reuse | [Caching](./caching.md) |
| Mark queries stale and trigger refresh | [Invalidation](./invalidation.md) |
| Perform asynchronous writes | [Mutations](./mutations.md) |
| Run work in workers | [Query Pool and Workers](./workers.md) |
| Transfer large binary values | [Transferable Data](./transfers.md) |
| Understand the overall Query Pool architecture | [Query Pool Overview](./overview.md) |
