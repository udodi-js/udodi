# Queries

A query represents one asynchronous read in a Query Pool. It owns the execution definition, reactive result state, optional input, cache entry, and controls for fetching, refreshing, cancelling, resetting, and invalidating the query.

Queries are registered with `pool.query()`:

```js
import { createQueryPool } from "udodi";

const pool = createQueryPool();

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

The returned query handle is stable for the lifetime of the registered query.

```js
const sameUsers = pool.query("users", {
  source: async () => [],
});

console.log(users === sameUsers); // true
```

Calling `pool.query()` again with an existing key returns the existing query rather than replacing its definition.

---

## Query Definitions

A query definition must provide exactly one execution mechanism:

- `source` — execute locally on the current thread.
- `module` — execute through a registered worker module.

A local query may additionally provide `compute`.

### Local query

```text
source(signal, input)
        │
        ▼
   raw result
        │
        ▼
compute(raw result)
        │
        ▼
    query.data
```

### Worker query

A worker query does not use `source` or `compute`:

```text
fetch(input)
     │
     ▼
Worker Module
     │
     ▼
query.data
```

`module` cannot be combined with `source` or `compute`.

---

## Local Queries

The simplest query uses a `source` function.

```js
const posts = pool.query("posts", {
  source: async (signal) => {
    const response = await fetch("/api/posts", {
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },
});
```

The pool creates an `AbortController` for each execution and passes its signal to `source`.

Passing the signal to the underlying asynchronous operation allows `query.cancel()` to propagate cancellation:

```js
const posts = pool.query("posts", {
  source: (signal) =>
    fetch("/api/posts", { signal }).then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    }),
});
```

### The source signature

The source receives:

```js
source(signal, input)
```

- `signal` is always the execution's `AbortSignal`.
- `input` is the query input for that execution.

```js
const users = pool.query("users", {
  source: async (signal, input) => {
    const response = await fetch(
      `/api/users?page=${input?.page ?? 1}`,
      { signal },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },
});
```

The source may return either a value or a Promise.

---

## Transforming Results with compute

Use `compute` when the value returned by `source` is not the final value that the query should expose.

```js
const activeUsers = pool.query("activeUsers", {
  source: async (signal) => {
    const response = await fetch("/api/users", {
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },

  compute: (users) =>
    users.filter((user) => user.active),
});
```

The pipeline is:

```text
source(signal, input)
        │
        ▼
   raw response
        │
        ▼
compute(raw response)
        │
        ▼
   query.data
```

`compute` receives only the value returned by `source`. It does not receive the `AbortSignal` or query input.

Because query execution awaits the executor result, `compute` may also return a Promise:

```js
const users = pool.query("users", {
  source: fetchUsers,

  compute: async (users) => {
    return users.filter((user) => user.active);
  },
});
```

For ordinary synchronous transformations, a normal function is preferable.

---

## Query Input

Input is supplied through `fetch()`:

```js
const users = pool.query("users", {
  source: async (signal, input) => {
    const page = input?.page ?? 1;

    const response = await fetch(
      `/api/users?page=${page}`,
      { signal },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },
});

await users.fetch({
  input: { page: 2 },
});
```

The input is passed to `source`:

```text
fetch({ input })
       │
       ▼
source(signal, input)
```

Input is useful for parameterized queries where the execution itself remains the same but the request parameters change.

### Definition-level input

A query may define an initial input:

```js
const users = pool.query("users", {
  input: {
    page: 1,
  },

  source: async (signal, input) => {
    const response = await fetch(
      `/api/users?page=${input.page}`,
      { signal },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },
});
```

The definition input becomes the initial cached input used by the query's normal execution path and subsequent `refresh()` calls.

A later non-transferable `fetch()` replaces the cached input:

```js
await users.fetch({
  input: { page: 2 },
});

await users.refresh();
// Uses { page: 2 }
```

---

## fetch()

`fetch()` performs an explicit execution of the query.

```js
await users.fetch({
  input: {
    page: 2,
  },
});
```

Its options are:

| Option | Purpose |
| --- | --- |
| `input` | Input passed to `source` or the worker module. |
| `transfer` | Override the query definition's Transferable Object setting. |
| `dependencies` | Execute `dependsOn` queries before this query. |
| `force` | When `dependencies: true`, force upstream dependencies to re-execute. |

### Fetching with input

```js
await users.fetch({
  input: {
    page: 2,
  },
});
```

By default, `fetch()` executes this query. Its `dependsOn` queries are not automatically executed.

To explicitly execute the dependency graph first:

```js
await users.fetch({
  input: {
    page: 2,
  },
  dependencies: true,
});
```

With `dependencies: true`, upstream dependencies execute first and the current query then executes with the explicitly supplied input.

This distinction is important:

```text
fetch()
  │
  └── current query only

fetch({ dependencies: true })
  │
  ├── dependency
  ├── dependency
  └── current query
```

When `dependencies: true` is used, `force: true` applies to the upstream dependency execution:

```js
await users.fetch({
  input: { page: 2 },
  dependencies: true,
  force: true,
});
```

A successful `fetch()` also schedules queries that depend on this query according to the pool's dependent-refresh mechanism.

---

## refresh()

`refresh()` runs the query's dependency execution plan.

```js
await users.refresh();
```

For a query with dependencies:

```text
session
   │
   ▼
profile
   │
   ▼
dashboard
```

Refreshing `dashboard` executes the required upstream queries before `dashboard`.

```js
await dashboard.refresh();
```

The plan is executed as a graph rather than by recursively calling public `refresh()` methods.

### Refresh options

```js
await users.refresh({
  force: true,
});
```

`force` causes in-flight work to be cancelled where applicable and causes the plan to re-execute instead of simply reusing work that would otherwise be considered current.

You can also schedule reverse dependents after the plan:

```js
await users.refresh({
  dependents: true,
});
```

The pool-level equivalent is:

```js
await pool.refresh("users", {
  force: true,
});
```

---

## fetch() vs refresh()

The distinction is important:

| Operation | Purpose |
| --- | --- |
| `fetch({ input })` | Execute this query with explicit input. |
| `fetch({ dependencies: true })` | Execute dependencies first, then this query with explicit input. |
| `refresh()` | Execute this query through its dependency plan using its cached input. |
| `refresh({ force: true })` | Force the dependency plan to re-execute. |

For example:

```js
// Change the query input and execute it.
await users.fetch({
  input: { page: 3 },
});

// Re-run using the cached input.
await users.refresh();
```

---

## Query State

A query handle exposes reactive state:

```js
const users = pool.query("users", {
  source: fetchUsers,
});

console.log(users.data);
console.log(users.error);
console.log(users.loading);
console.log(users.status);
```

The public fields are:

| Field | Description |
| --- | --- |
| `data` | Latest successful query result. |
| `chunks` | Chunks accumulated during the current streamed execution. |
| `error` | Latest execution error. |
| `loading` | Whether an execution is currently in progress. |
| `streaming` | Whether a stream is currently open. |
| `streamed` | Whether at least one chunk has been received during the current streamed run. |
| `status` | Current lifecycle status. |

The lifecycle status is one of:

- `"idle"`
- `"loading"`
- `"success"`
- `"error"`
- `"cancelled"`

The fields are reactive. Reading them inside an effect, computed value, or template establishes the corresponding reactive dependency.

```js
const label = computed(() => {
  if (users.loading) {
    return "Loading users…";
  }

  if (users.error) {
    return "Failed to load users";
  }

  return `Users: ${(users.data ?? []).length}`;
});
```

A change to `users.loading` does not require manually notifying the consumer.

---

## Initial Execution

Registering a query starts its initial execution plan automatically.

```js
const users = pool.query("users", {
  source: fetchUsers,
});
```

The call itself is synchronous and immediately returns the query handle.

The asynchronous execution happens after registration:

```text
pool.query()
     │
     ├── returns query handle immediately
     │
     └── starts initial execution
             │
             ▼
          loading
             │
       ┌─────┴─────┐
       ▼           ▼
    success       error
```

Initial execution errors are exposed through `error` and `status`; they do not cause the `pool.query()` call itself to reject.

```js
const users = pool.query("users", {
  source: fetchUsers,
});

console.log(users.status);
// "idle" initially, then "loading", followed by "success" or "error"
```

When dependencies are declared, the initial execution also respects the dependency graph.

---

## In-Flight Deduplication

The Query Pool reuses an existing in-flight execution when the same query is executed again without `force`.

```js
const first = users.refresh();
const second = users.refresh();

console.log(first === second); // true
```

Both callers therefore await the same execution rather than starting duplicate work.

This is particularly useful when several parts of an application request the same query at approximately the same time.

To force a new execution:

```js
const first = users.refresh();
const second = users.refresh({
  force: true,
});
```

The forced execution supersedes the active execution.

---

## Cancellation

Every query execution has an associated `AbortController`.

```js
const users = pool.query("users", {
  source: async (signal) => {
    const response = await fetch("/api/users", {
      signal,
    });

    return response.json();
  },
});

users.cancel();
```

Cancellation:

- aborts the current `AbortController`,
- supersedes the current execution,
- clears the in-flight execution,
- stops the loading/streaming state,
- sets `status` to `"cancelled"` when the query was loading,
- preserves existing successful data.

Therefore, cancellation does not erase the last successful result.

```text
successful data
      │
      ▼
new execution
      │
      ▼
   loading
      │
    cancel()
      │
      ▼
 cancelled
data remains available
```

Always pass the provided `signal` to APIs that support cancellation.

---

## Resetting a Query

`reset()` returns the query to its initial state.

```js
users.reset();
```

Reset:

- cancels an active execution,
- clears `data`,
- clears `chunks`,
- clears `error`,
- clears cached query data,
- clears cached input,
- returns the query to `"idle"`.

This differs from `cancel()`:

```text
cancel()
  ├── stop current execution
  ├── keep existing data
  └── status → cancelled

reset()
  ├── stop current execution
  ├── clear data
  ├── clear cache
  ├── clear cached input
  └── status → idle
```

---

## Caching

Caching is optional and configured through the query definition:

```js
const users = pool.query("users", {
  source: fetchUsers,

  cache: {
    ttl: 60_000,
  },
});
```

A successful execution creates a cache entry.

On a later execution, the pool can reuse the cached result when the entry is fresh and execution is not forced:

```text
             query execution
                    │
                    ▼
               cache entry
                    │
             ┌──────┴──────┐
             │             │
          fresh?          stale?
             │             │
            yes            no
             │             │
             ▼             ▼
        reuse data      execute query
```

Freshness is based on the configured TTL and the entry's timestamp.

A query with no cache configuration does not reuse a previous result through the Query Pool cache.

See [Caching](./caching.md) for the complete cache model.

---

## Invalidating a Query

`invalidate()` marks the query's cache entry as stale.

```js
users.invalidate();
```

It does not start a new execution by itself.

```text
invalidate()
      │
      ▼
cache marked stale
      │
      ├── no immediate request
      │
      └── next execution
             │
             ▼
        source/module runs
```

To invalidate and then explicitly refresh:

```js
users.invalidate();
await users.refresh();
```

Invalidation is especially useful after mutations. See [Invalidation](./invalidation.md).

---

## Dependent Queries

Queries can depend on other queries with `dependsOn`.

```js
const session = pool.query("session", {
  source: async (signal) => {
    const response = await fetch("/api/session", {
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },
});

const profile = pool.query("profile", {
  dependsOn: ["session"],

  source: async (signal) => {
    const sessionData = pool.data("session");

    const response = await fetch(
      `/api/profile/${sessionData.userId}`,
      { signal },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },
});
```

The dependency graph is:

```text
session
   │
   ▼
profile
```

When `profile` executes through its normal dependency plan, `session` is executed first.

Multiple independent dependencies can also be declared:

```js
const dashboard = pool.query("dashboard", {
  dependsOn: [
    "session",
    "notifications",
  ],

  source: async (signal) => {
    const session = pool.data("session");
    const notifications = pool.data("notifications");

    return {
      user: session.user,
      notifications,
    };
  },
});
```

The independent branches can execute in parallel:

```text
          dashboard
          /       \
         ▼         ▼
     session   notifications
```

Cycles in `dependsOn` are rejected when the execution plan is built.

See [Query Dependencies](./dependencies.md).

---

## Worker Module Queries

A query can execute inside the Compute Worker Pool instead of using a local `source`.

First register the worker module:

```js
pool.registerModule("heavySort", {
  url: new URL(
    "./workers/sort.js",
    import.meta.url,
  ).href,
});
```

Then reference it from the query:

```js
const sorted = pool.query("sorted", {
  module: "heavySort",
});
```

Worker execution must be enabled when the pool is created:

```js
const pool = createQueryPool({
  worker: {
    enabled: true,
    computeWorkers: 2,
  },
});
```

The worker execution path is:

```text
UI Thread
    │
    ▼
Worker Bridge
    │
    ▼
Main Worker
    │
    ▼
Compute Worker Pool
    │
    ▼
Worker Module
```

A worker-module query cannot define `source` or `compute`:

```js
// Invalid
const query = pool.query("sorted", {
  module: "heavySort",
  source: fetchSomething,
});
```

The module must be registered before the query is created.

See [Query Registry](./registry.md) and [Query Pool and Workers](./workers.md).

---

## Streaming Queries

Streaming is available only for worker-module queries.

```js
const events = pool.query("events", {
  module: "eventStream",
  stream: true,
});
```

During streaming, the query exposes:

```js
events.streaming;
events.streamed;
events.chunks;
```

For example:

```js
const events = pool.query("events", {
  module: "eventStream",
  stream: true,
});

await events.refresh();

console.log(events.chunks);
```

The streaming state follows this general model:

```text
execution
    │
    ▼
streaming = true
    │
    ├── chunk → chunks
    ├── chunk → chunks
    ├── chunk → chunks
    │
    ▼
stream ends
    │
    ▼
streaming = false
```

`stream` is not supported for local `source` queries.

See [Query Pool and Workers](./workers.md) for worker execution details.

---

## Transferable Input

Worker queries use structured cloning by default.

For large binary values, Transferable Object transport can be enabled:

```js
const processor = pool.query("processBuffer", {
  module: "processBuffer",
  transfer: true,
});
```

The setting can also be supplied for an individual execution:

```js
const buffer = new ArrayBuffer(1024 * 1024);

await processor.fetch({
  input: buffer,
  transfer: true,
});
```

`fetch({ transfer })` overrides the query definition's `transfer` setting for that execution.

Because transferring an object moves ownership and can detach it from the sender, transferable input is not cached for later reuse.

For example:

```js
const buffer = new ArrayBuffer(1024);

await processor.fetch({
  input: buffer,
  transfer: true,
});

// `buffer` has been transferred and should not be treated
// as reusable query input.
```

When `transfer` is false, the latest input can be cached and reused by subsequent `refresh()` calls.

See [Transferable Data](./transfers.md).

---

## Query Data Outside a Handle

The pool also provides `data()` for reading the current result by key:

```js
const users = pool.query("users", {
  source: fetchUsers,
});

const data = pool.data("users");
```

This is particularly useful inside another query:

```js
const userCount = pool.query("userCount", {
  dependsOn: ["users"],

  source: async () => {
    return (pool.data("users") ?? []).length;
  },
});
```

`pool.data()` reads the current reactive query data. It does not execute the query.

---

## Writing Query Data

`pool.setQueryData()` updates a registered query's reactive data without executing its `source` or worker module.

```js
pool.setQueryData("users", [
  {
    id: 1,
    name: "Ada",
  },
]);
```

It also accepts an updater function:

```js
pool.setQueryData(
  "users",
  (users) => [
    ...(users ?? []),
    {
      id: 2,
      name: "Grace",
    },
  ],
);
```

This API is primarily useful for optimistic mutation updates and rollback.

For example:

```js
const previous = pool.data("users") ?? [];

pool.setQueryData("users", [
  ...previous,
  {
    id: "temporary",
    name: "Ada",
  },
]);
```

It changes the reactive query data; it does not execute the query's asynchronous work.

---

## Reactive Usage

Query handles can be consumed directly by Udodi's reactive primitives.

```js
const users = pool.query("users", {
  source: fetchUsers,
});

const userCount = computed(() => {
  return users.data?.length ?? 0;
});
```

An effect can react to lifecycle changes:

```js
effect(() => {
  if (users.loading) {
    console.log("Loading users…");
  }

  if (users.error) {
    console.error(users.error);
  }
});
```

Templates can also read query state directly when the query handle is exposed through the component context.

The important point is that request state does not need to be copied into component state merely to make it reactive.

---

## Complete Example

The following example combines input, transformation, caching, reactive state, explicit fetching, and refresh.

```js
import { computed, createQueryPool } from "udodi";

const pool = createQueryPool();

const users = pool.query("users", {
  input: {
    page: 1,
  },

  source: async (signal, input) => {
    const page = input?.page ?? 1;

    const response = await fetch(
      `/api/users?page=${page}`,
      { signal },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },

  compute: (result) => result.items,

  cache: {
    ttl: 60_000,
  },
});

const userCount = computed(() => {
  return users.data?.length ?? 0;
});

// Wait for the first execution.
await users.refresh();

console.log(users.data);
console.log(userCount.value);

// Change the query input.
await users.fetch({
  input: {
    page: 2,
  },
});

// Reuse the latest non-transferable input.
await users.refresh();

// Force a fresh execution.
await users.refresh({
  force: true,
});

// Stop an active request.
users.cancel();

// Clear the query completely.
users.reset();
```

---

## Query API Summary

### Definition

| Option | Description |
| --- | --- |
| `source` | Local asynchronous source function receiving `(signal, input)`. |
| `compute` | Optional transformation of the source result. |
| `module` | Registered worker module key. |
| `input` | Initial query input retained for subsequent normal refreshes. |
| `stream` | Enables streaming for worker-module queries. |
| `transfer` | Enables Transferable Object transport by default. |
| `cache` | Optional cache configuration, including `ttl`. |
| `dependsOn` | Query keys that must execute before this query. |

### Query handle

| Property / method | Description |
| --- | --- |
| `data` | Latest successful result. |
| `chunks` | Accumulated chunks for the current streamed execution. |
| `error` | Latest execution error. |
| `loading` | Whether execution is in progress. |
| `streaming` | Whether a stream is currently open. |
| `streamed` | Whether a chunk has been received during the current stream. |
| `status` | `"idle"`, `"loading"`, `"success"`, `"error"`, or `"cancelled"`. |
| `fetch(options?)` | Execute with explicit input and optional dependency execution. |
| `refresh(options?)` | Execute the dependency plan using the query's cached input. |
| `cancel()` | Cancel the current execution. |
| `reset()` | Cancel and clear query state, cache, and cached input. |
| `invalidate()` | Mark cached data stale without executing the query. |

### Pool helpers

| Method | Description |
| --- | --- |
| `pool.query(key, definition)` | Register or retrieve a query. |
| `pool.get(key)` | Retrieve a registered query handle. |
| `pool.has(key)` | Test whether a query is registered. |
| `pool.data(key)` | Read the current query data. |
| `pool.setQueryData(key, value \| fn)` | Update query data without executing the query. |
| `pool.refresh(key, options?)` | Execute a query through its dependency plan. |

---

## Next Steps

| Goal | Guide |
| --- | --- |
| Understand query lifecycle and status | [Query Lifecycle](./lifecycle.md) |
| Understand execution order, and connect queries with dependencies | [Query Dependencies](./dependencies.md) |
| Configure TTL caching | [Caching](./caching.md) |
| Invalidate and refresh queries | [Invalidation](./invalidation.md) |
| Cancel asynchronous work | [Query Cancellation](./cancellation.md) |
| Register worker modules | [Query Registry](./registry.md) |
| Execute queries in workers | [Query Pool and Workers](./workers.md) |
| Transfer large binary input | [Transferable Data](./transfers.md) |

For the conceptual model behind queries, see [Query Pool Overview](./overview.md).

For exact signatures and option types, see the [Query Pool API Reference](../api/query-pool.md).
