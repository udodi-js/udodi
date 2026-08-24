# Query Pool

Udodi's **Query Pool** provides a reactive runtime for asynchronous data and mutations.

It coordinates:

- **Queries** — asynchronous reads with reactive state, caching, and refresh.
- **Mutations** — asynchronous writes with optimistic updates, rollback, and invalidation.
- **Dependencies** — execution graphs between related queries.
- **In-flight deduplication** — reuse work that is already running.
- **Caching** — optional TTL-based reuse of successful query results.
- **Invalidation** — mark related queries stale and refresh them when appropriate.
- **Cancellation** — abort in-flight queries and mutations.
- **Worker execution** — optionally execute module-backed work through a Main Worker and Compute Worker Pool.
- **Transferable transport** — optionally move transferable objects between worker boundaries without structured cloning.

Query and mutation handles expose reactive state such as `data`, `error`, `loading`, and `status`, allowing Udodi components, effects, and computed values to react directly to asynchronous execution.

The Query Pool is intended for **server state and asynchronous work**. For shared client-side application state, use [Udodi Store](../store/README.md).

---

## Guides

| Guide | Description |
| --- | --- |
| **[Query Pool Overview](./overview.md)** | Understand the Query Pool model, its state ownership boundary, and how queries, mutations, dependencies, caching, and workers fit together. |
| **[Queries](./queries.md)** | Create local and worker-backed queries, execute them with `fetch()` and `refresh()`, and work with reactive query state. |
| **[Query Lifecycle](./lifecycle.md)** | Understand query execution states, lifecycle transitions, cancellation, reactive fields, and reset behavior. |
| **[Query Registry](./registry.md)** | Register worker modules and make them available to module-backed queries and mutations. |
| **[Mutations](./mutations.md)** | Perform asynchronous writes with optimistic updates, rollback, success hooks, cancellation, and automatic invalidation. |
| **[Query Dependencies](./dependencies.md)** | Build dependency graphs with `dependsOn`, control execution order, and refresh dependent queries. |
| **[Caching](./caching.md)** | Configure TTL-based caching, understand freshness, and control when cached results are reused. |
| **[Invalidation](./invalidation.md)** | Mark queries stale and refresh them after mutations or explicit invalidation. |
| **[Query Scheduling](./scheduling.md)** | Understand dependency execution plans, parallel branches, in-flight reuse, and forced execution. |
| **[Query Cancellation](./cancellation.md)** | Cancel in-flight queries and mutations and understand cancellation state and data preservation. |
| **[Query Pool and Workers](./workers.md)** | Execute module-backed queries and mutations through the Main Worker and Compute Worker Pool. |
| **[Transferable Data](./transfers.md)** | Use Transferable Object transport for large binary inputs and understand ownership and caching implications. |

**Start here → [Query Pool Overview](./overview.md)**

---

## Quick Example

The following example creates an isolated Query Pool, registers a query and mutation, connects a dependent query, and uses caching and invalidation.

```js
import { createQueryPool } from "udodi";

const pool = createQueryPool();

// Query
const users = pool.query("users", {
  source: async (signal) => {
    const res = await fetch("/api/users", { signal });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
  },

  cache: {
    ttl: 60_000,
  },
});

// Dependent query
const userCount = pool.query("userCount", {
  dependsOn: ["users"],
  source: async () => {
    const users = pool.data("users") ?? [];
    return users.length;
  },
});

// Mutation
const createUser = pool.mutation("createUser", {
  execute: async (input, { signal }) => {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
  },

  onMutate(input, ctx) {
    const previous = ctx.getQueryData("users") ?? [];

    ctx.setQueryData("users", [
      ...previous,
      {
        id: "temp",
        ...input,
      },
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

// Reactive query state
console.log(users.status);
console.log(users.loading);
console.log(users.data);

// Execute with input
await users.fetch({
  input: {
    page: 1,
  },
});

// Refresh the dependency graph:
// users → userCount
await pool.refresh("userCount");

// Successful mutation invalidates "users".
await createUser.mutate({
  name: "Ada",
});
```

This example demonstrates the fundamental Query Pool relationships:

1. `createQueryPool()` creates an isolated query runtime.
2. `pool.query()` registers a reactive query.
3. A query can expose asynchronous state without requiring manual loading or error bookkeeping.
4. `dependsOn` establishes a directed dependency graph between queries.
5. `pool.mutation()` defines an asynchronous write path.
6. Mutations can optimistically update query data and invalidate affected queries.
7. Query caching is optional and controlled independently from execution.
8. Query and mutation execution can be cancelled through their handles.
9. Worker-backed execution is available when asynchronous computation should leave the UI thread.

For the complete execution model, see [Query Pool Overview](./overview.md).

---

## Creating a Pool

Create an isolated Query Pool with `createQueryPool()`:

```js
import { createQueryPool } from "udodi";

const pool = createQueryPool();
```

Each pool owns its registered queries, mutations, dependency graph, cache state, and execution coordination.

Worker execution can be enabled when module-backed queries or mutations are required:

```js
const pool = createQueryPool({
  worker: {
    enabled: true,
    computeWorkers: 2,
  },
});
```

### Pool Options

| Option | Purpose |
| --- | --- |
| `worker.enabled` | Enables worker-module execution. Required for definitions that use `module`. |
| `worker.computeWorkers` | Number of Compute Workers managed by the Main Worker. |
| `registry` | Optional shared query module registry. |

When worker execution is disabled, definitions that specify `module` cannot execute.

See [Query Pool and Workers](./workers.md) for the worker architecture and [Query Registry](./registry.md) for module registration.

---

## Query Pool at a Glance

The Query Pool API is organized around a few primary operations:

| API | Purpose |
| --- | --- |
| `createQueryPool()` | Create an isolated Query Pool runtime. |
| `pool.query()` | Register or retrieve a query. |
| `pool.mutation()` | Register or retrieve a mutation. |
| `pool.get()` | Retrieve a registered query handle. |
| `pool.has()` | Check whether a query is registered. |
| `pool.data()` | Read the current data for a query. |
| `pool.setQueryData()` | Update query data without executing the query. |
| `pool.refresh()` | Execute a query through its dependency plan. |
| `pool.registerModule()` | Register a worker module for module-backed execution. |
| `pool.terminate()` | Terminate worker infrastructure and cancel in-flight mutations. |

The individual guides document each API in detail.

---

## Queries

A query represents an asynchronous read.

A local query uses `source`:

```js
const posts = pool.query("posts", {
  source: async (signal, input) => {
    const url = new URL("/api/posts", location.origin);

    if (input?.page) {
      url.searchParams.set("page", input.page);
    }

    const res = await fetch(url, { signal });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
  },
});
```

A query may also transform its source result with `compute`:

```js
const posts = pool.query("posts", {
  source: fetchPosts,
  compute: (result) => result.items,
});
```

A query can declare dependencies:

```js
const userCount = pool.query("userCount", {
  dependsOn: ["users"],
  source: async () => {
    return (pool.data("users") ?? []).length;
  },
});
```

Worker-backed queries use a registered module:

```js
pool.registerModule("heavySort", {
  url: new URL("./workers/sort.js", import.meta.url).href,
});

const sorted = pool.query("sorted", {
  module: "heavySort",
});
```

See [Queries](./queries.md) for query creation, inputs, execution, streaming, and the complete query handle API.

---

## Query State

A query handle exposes reactive execution state:

| Property / method | Purpose |
| --- | --- |
| `data` | Latest successful result. |
| `chunks` | Streamed chunks accumulated during the current run. |
| `error` | Latest execution error, if any. |
| `loading` | Whether execution is currently in progress. |
| `streaming` | Whether a stream is currently open. |
| `streamed` | Whether a chunk has been received during the current run. |
| `status` | Current lifecycle state. |
| `fetch(options?)` | Execute with optional input, transfer, and dependency options. |
| `refresh(options?)` | Execute the query through its dependency plan. |
| `cancel()` | Cancel the current execution. |
| `reset()` | Cancel execution and return the query to its initial state. |
| `invalidate()` | Mark cached data stale without immediately executing the query. |

The lifecycle status can be:

- `idle`
- `loading`
- `success`
- `error`
- `cancelled`

These properties are reactive and can therefore be consumed directly by Udodi components and reactive computations.

See [Query Lifecycle](./lifecycle.md) for the complete lifecycle model.

---

## Mutations

Mutations represent asynchronous writes.

```js
const updatePost = pool.mutation("updatePost", {
  execute: async (input, { signal }) => {
    const res = await fetch(`/api/posts/${input.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
  },

  onMutate(input, ctx) {
    const previous = ctx.getQueryData("posts");
    // Apply optimistic update.
    return { previous };
  },

  onError(error, input, ctx) {
    // Roll back optimistic state.
  },

  onSuccess(result, input, ctx) {
    // Optional post-success work.
  },
  
  invalidates: ["posts"],
});
```

Execute the mutation with:

```js
await updatePost.mutate({
  id: 1,
  title: "Updated",
});
```

Mutation handles expose reactive state similar to queries, including:

- `data`
- `variables`
- `error`
- `loading`
- `status`
- `chunks`
- `streaming`
- `streamed`

They also provide:

- `mutate()`
- `cancel()`
- `reset()`

Mutations can invalidate queries automatically after successful execution.

See [Mutations](./mutations.md) for optimistic updates, rollback, invalidation, streaming, and mutation lifecycle.

---

## Dependencies

Queries can declare upstream dependencies:

```js
const profile = pool.query("profile", {
  dependsOn: ["session"],
  source: async () => {
    // ...
  },
});
```

The Query Pool turns these relationships into an execution graph.

A refresh of a dependent query can therefore execute the required upstream queries first:

```text
session
   │
   ▼
profile
   │
   ▼
dashboard
```

Independent branches can execute in parallel, while in-flight work can be reused rather than started again.

Dependency cycles are rejected.

Dependencies also interact with invalidation: a successful mutation or explicit invalidation can optionally propagate refreshes through dependent queries.

See [Query Dependencies](./dependencies.md) for the execution-plan model and [Query Scheduling](./scheduling.md) for scheduling behavior.

---

## Caching

Caching is optional and configured per query:

```js
const users = pool.query("users", {
  source: fetchUsers,
  cache: {
    ttl: 60_000,
  },
});
```

A fresh cached result can satisfy a query without executing its source again.

The cache is tied to query execution and freshness rather than being a general-purpose application-state store.

Use [Caching](./caching.md) for:

- TTL configuration
- freshness
- cache reuse
- forced execution
- cache behavior during refresh
- interaction between caching and invalidation

---

## Invalidation

Invalidation marks query data as stale.

```js
users.invalidate();
```

Invalidation does not itself imply that a new execution must immediately begin. It makes the cached result eligible for re-execution by a subsequent execution plan.

Mutations can declare the queries they invalidate:

```js
const createUser = pool.mutation("createUser", {
  execute: createUserRequest,
  invalidates: ["users"],
});
```

Invalidation can also target dependents:

```js
invalidates: [
  {
    key: "users",
    dependents: true,
    force: false,
  },
],
```

See [Invalidation](./invalidation.md) for invalidation targets, dependent refreshes, and forced execution.

---

## Cancellation

Every query and mutation execution is associated with an `AbortController`.

A running query can be cancelled through its handle:

```js
users.cancel();
```

Likewise:

```js
createUser.cancel();
```

Cancellation propagates through the execution signal used by the asynchronous operation.

When an in-flight execution is cancelled:

- the execution is aborted;
- the current run is superseded;
- the handle enters `cancelled` status when appropriate;
- previously successful data remains available.

This allows a UI to stop work without necessarily losing the last successful result.

See [Query Cancellation](./cancellation.md) for cancellation semantics and `AbortSignal` propagation.

---

## Workers

The Query Pool can execute module-backed queries and mutations outside the UI thread.

The worker architecture is:

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
    ├── Compute Worker
    ├── Compute Worker
    └── Compute Worker
```

Enable workers when creating the pool:

```js
const pool = createQueryPool({
  worker: {
    enabled: true,
    computeWorkers: 2,
  },
});
```

Register a module:

```js
pool.registerModule("heavyTask", {
  url: new URL("./workers/heavy-task.js", import.meta.url).href,
});
```

Then reference it from a query or mutation:

```js
const result = pool.query("heavyTaskResult", {
  module: "heavyTask",
});
```

Worker execution is optional. Local queries and mutations can execute directly without the worker infrastructure.

See [Query Pool and Workers](./workers.md) for the worker architecture and [Query Registry](./registry.md) for module registration.

---

## Transferable Data

Worker-backed execution uses structured cloning by default.

For supported Transferable Objects, transport can instead be explicitly enabled:

```js
const result = pool.query("processBinary", {
  module: "binaryProcessor",
  transfer: true,
});
```

Transferable transport can move objects such as:

- `ArrayBuffer`
- `MessagePort`
- `ImageBitmap`
- `OffscreenCanvas`
- underlying buffers of typed arrays and `DataView`

without cloning their contents.

Because transfer moves ownership, the original transferable can become detached after it is sent. Consequently, transferable input is not cached for later reuse.

Transfer can also be selected per execution:

```js
await result.fetch({
  input: largeBuffer,
  transfer: true,
});
```

See [Transferable Data](./transfers.md) for transfer detection, ownership, worker boundaries, and caching implications.

---

## Cleanup

Terminate the pool when its worker infrastructure is no longer needed:

```js
pool.terminate();
```

Termination:

- terminates the worker bridge when one exists;
- cancels in-flight mutations;
- releases the worker execution infrastructure.

Existing query handles remain as JavaScript objects after termination. If their state should be reset or references released, handle that explicitly with `reset()` or by dropping the references.

See [Query Pool Overview](./overview.md) for the broader lifecycle and ownership model.

---

## Store vs Query Pool

Query Pool and Udodi Store deliberately solve different problems.

| Concern | Prefer |
| --- | --- |
| State owned by one component | Component state |
| Shared client/application state | Udodi Store |
| Server data | Query Pool |
| Request lifecycle | Query Pool |
| Remote-data caching | Query Pool |
| Query invalidation and refresh | Query Pool |
| Asynchronous mutations | Query Pool |
| Worker-backed asynchronous work | Query Pool |
| Durable client preferences | Store + persistence |

A Store action can still call an API, and a query or mutation can update application state. The distinction is ownership and lifecycle.

Use **Store** when the application owns the state.

Use **Query Pool** when the state is tied to asynchronous work, server data, request caching, invalidation, refresh, or mutation execution.

See [Udodi Store](../store/README.md) for application state management.

---

## Next Steps

| If you want to... | Start with |
| --- | --- |
| Understand the architecture and state boundary | [Query Pool Overview](./overview.md) |
| Create and execute queries | [Queries](./queries.md) |
| Understand query states and transitions | [Query Lifecycle](./lifecycle.md) |
| Register worker modules | [Query Registry](./registry.md) |
| Perform asynchronous writes | [Mutations](./mutations.md) |
| Connect queries into an execution graph | [Query Dependencies](./dependencies.md) |
| Control cache freshness | [Caching](./caching.md) |
| Refresh stale queries | [Invalidation](./invalidation.md) |
| Understand execution order | [Query Scheduling](./scheduling.md) |
| Stop in-flight work | [Query Cancellation](./cancellation.md) |
| Run work outside the UI thread | [Query Pool and Workers](./workers.md) |
| Transfer large binary values efficiently | [Transferable Data](./transfers.md) |

The [Query Pool API Reference](../api/query-pool.md) is the authoritative source for exact signatures, options, and return values.
