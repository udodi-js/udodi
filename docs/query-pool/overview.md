# Query Pool Overview

Udodi's Query Pool is a reactive runtime for asynchronous data and mutations.

It owns the lifecycle of work tied to remote data, background computation, request caching, invalidation, refresh, and mutation execution. Component state and [Udodi Store](../store/README.md) own client-side application state; Query Pool owns the lifecycle of asynchronous work and the reactive state that represents that work.

A Query Pool coordinates:

- **Queries** — asynchronous reads with reactive state, caching, and refresh
- **Mutations** — asynchronous writes with optimistic updates, rollback, and invalidation
- **Dependencies** — directed execution graphs between related queries
- **In-flight deduplication** — reuse of work that is already running
- **Caching** — optional TTL-based reuse of successful results
- **Invalidation** — marking related queries stale and refreshing them when appropriate
- **Cancellation** — aborting in-flight queries and mutations
- **Worker execution** — optional module-backed work through a Main Worker and Compute Worker Pool
- **Transferable transport** — optional movement of transferable objects across worker boundaries without structured cloning

Query and mutation handles expose reactive fields such as `data`, `error`, `loading`, and `status`. Udodi components, effects, and computed values can therefore react directly to asynchronous execution without manually coordinating request state.

---

## The Query Pool Model

A Query Pool is an isolated runtime created with `createQueryPool()`:

```js
import { createQueryPool } from "udodi";

const pool = createQueryPool();
```

Each pool owns its own queries, mutations, dependency graph, cache, in-flight execution state, and optional worker infrastructure:

```text
┌────────────────────────────────────────────────────────────┐
│                       Query Pool                           │
│                                                            │
│  Queries            "users", "posts", "userCount", ...     │
│  Mutations          "createUser", "updatePost", ...        │
│  Dependency graph   users → userCount, session → profile   │
│  Cache entries      TTL + freshness per query              │
│  In-flight work     deduplicated execution promises        │
│  Module registry    worker module descriptors (optional)   │
│  Worker bridge      Main Worker + Compute Pool (optional)  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

The pool is the ownership boundary for:

- Query and mutation registration
- The dependency graph
- Cache and freshness state
- Execution plans and in-flight reuse
- Optional worker infrastructure

Different pools do not share queries, mutations, or cache. This isolation is intentional: an application can use one pool for the entire application or create separate pools for distinct subsystems.

---

## What the Query Pool Provides

| Capability | What it provides |
| --- | --- |
| **Queries** | Asynchronous reads with reactive `data`, `loading`, `error`, and `status` |
| **Mutations** | Asynchronous writes with optimistic updates, rollback, and automatic invalidation |
| **Dependencies** | `dependsOn` graphs, parallel independent branches, and dependent refresh cascades |
| **In-flight deduplication** | Reuse of an active execution unless `force` is set |
| **Caching** | Optional per-query TTL; fresh results can short-circuit re-execution |
| **Invalidation** | Mark cache stale; mutations can list keys and dependents to refresh |
| **Cancellation** | `AbortController` per run; `cancel()` supersedes the current execution |
| **Worker modules** | Execute registered modules off the UI thread |
| **Transferables** | Opt-in transfer of supported transferable objects |

The Query Pool API is asynchronous at the execution boundary.

Reading reactive fields such as `data`, `status`, or `loading` is synchronous. Starting or awaiting asynchronous work through `fetch()`, `refresh()`, or `mutate()` returns a Promise.

---

## Choosing a State Boundary

The most important Query Pool decision is not which method to call. It is deciding **who owns the state and its lifecycle**.

### Component state

Keep state local when it belongs to one component and is not the result of a shared request lifecycle:

```js
const Dialog = createComponent({
  state() {
    return {
      open: false,
    };
  },
});
```

### Udodi Store

Use the Store for shared client-owned application state:

```js
import { store } from "udodi";

store.set("theme", "dark");
```

Typical examples include:

- theme and locale
- session/client state
- feature flags
- drafts
- shared UI state
- durable client preferences

### Query Pool

Use Query Pool when a value is tied to asynchronous work:

- server data that must be fetched, cached, and refreshed
- request lifecycle such as loading, error, and success
- dependency-driven loading graphs
- mutations that invalidate related queries
- optional worker-backed computation

```js
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
```

A Store action can still call an API, and a query or mutation can still update application state. The distinction is **ownership and lifecycle**, not whether an API happens to be involved.

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

---

## Queries

A query is an asynchronous read registered under a unique string key.

### Local Queries

Local queries provide a `source` function. The pool passes an `AbortSignal` and optional input:

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

  compute: (result) => result.items,

  cache: {
    ttl: 30_000,
  },

  input: {
    page: 1,
  },
});
```

The local query pipeline is:

```text
source(signal, input)
        │
        ▼
compute(rawData)       // optional
        │
        ▼
    query.data
```

`source()` performs the asynchronous work. `compute()` is an optional transformation applied to the source result before it becomes the query's data.

### Worker Module Queries

Worker-backed queries reference a registered module instead of a local `source`:

```js
pool.registerModule("heavySort", {
  url: new URL("./workers/sort.js", import.meta.url).href,
});

const sorted = pool.query("sorted", {
  module: "heavySort",
  stream: false,
  transfer: false,
});
```

Module execution requires worker execution to be enabled.

Local `source` / `compute` definitions and module definitions represent different execution paths and are not combined on the same query.

### Query Handle

Registering a query returns a handle containing reactive state and execution controls:

| Field / method | Role |
| --- | --- |
| `data` | Latest successful result |
| `chunks` | Streamed chunks for the current run |
| `error` | Latest error, if any |
| `loading` | Whether an execution is in progress |
| `streaming` / `streamed` | Stream progress |
| `status` | `idle` \| `loading` \| `success` \| `error` \| `cancelled` |
| `fetch(options?)` | Execute with explicit input and optional dependency execution |
| `refresh(options?)` | Run the dependency execution plan for this key |
| `cancel()` | Abort the in-flight run |
| `reset()` | Cancel, clear data/cache/input, and return to `idle` |
| `invalidate()` | Mark cache stale without starting a new run |

These fields participate in Udodi's reactive system. Reading them inside an effect, computed value, or template establishes a dependency on the corresponding reactive state.

See [Queries](./queries.md) and [Query Lifecycle](./lifecycle.md) for the complete execution model.

---

## Mutations

A mutation represents an asynchronous write.

Mutations can execute locally or through a worker module and can coordinate optimistic updates, rollback, success hooks, and query invalidation.

```js
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

    return {
      previous,
    };
  },

  onError(_error, _input, ctx) {
    if (ctx.previous) {
      ctx.setQueryData("users", ctx.previous);
    }
  },

  invalidates: ["users"],
});

await createUser.mutate({
  name: "Attamah",
});
```

Mutation hooks receive a context containing:

- `pool` — the Query Pool public API
- `getQueryData(key)` — read current query data
- `setQueryData(key, value | fn)` — write query data without executing the query

The value returned by `onMutate()` is merged into the context available to later mutation hooks. This provides a convenient mechanism for retaining optimistic snapshots for rollback.

See [Mutations](./mutations.md) and [Invalidation](./invalidation.md).

---

## Dependencies and Scheduling

Queries can declare upstream dependencies with `dependsOn`:

```js
const userCount = pool.query("userCount", {
  dependsOn: ["users"],

  source: async () => {
    return (pool.data("users") ?? []).length;
  },
});
```

When a query is registered, refreshed, or fetched with dependency execution enabled, the pool:

1. Builds a depth-first execution plan. Cycles are rejected.
2. Executes ready nodes in waves.
3. Runs independent branches in parallel.
4. Drives each node through its internal execution path rather than recursively invoking public `refresh()`.
5. Reuses in-flight work unless `force` is requested.
6. Can schedule reverse dependents after successful execution when `dependents` is enabled.

Conceptually:

```text
buildExecutionPlan(key)
        │
        ▼
executeExecutionPlan(key)
        │
        ├── runSelf()              (per query)
        │
        └── scheduleDependents()   (optional reverse cascade)
```

Upstream dependency failures are represented as `QueryDependencyError` for dependent nodes so that the root query can retain its original error, including an `AbortError`.

See [Query Dependencies](./dependencies.md) and [Query Scheduling](./scheduling.md).

---

## Caching and Invalidation

Caching is optional and configured per query:

```js
cache: {
  ttl: 60_000,
}
```

A cache entry can be reused when it is fresh and the execution is not forced:

```text
            Query execution
                   │
                   ▼
            Check cache entry
                   │
            ┌──────┴──────┐
            │             │
      Fresh & not       Stale,
         forced       missing, or
            │           forced
            ▼             │
      Reuse result        │
            │             ▼
            │        Execute query
            │             │
            └──────┬──────┘
                   ▼
              Query result
```

### Invalidation

Calling:

```js
query.invalidate();
```

marks the query's cache entry stale. It does not itself start a new execution.

Mutations can declare queries to invalidate:

```js
invalidates: [
  "users",
  {
    key: "userDetail",
    dependents: true,
  },
]
```

After a successful mutation, the configured queries are invalidated and refreshed according to the invalidation options.

Cache belongs to query execution and freshness. It is therefore fundamentally different from application-state persistence in the Store.

See [Caching](./caching.md) and [Invalidation](./invalidation.md).

---

## Cancellation

Each execution creates an `AbortController`.

For local work, its signal is passed to `source()` or `execute()`. For module-backed work, cancellation is forwarded through the worker bridge.

Calling `cancel()`:

- supersedes the current run
- aborts the associated controller
- clears the in-flight execution
- changes status to `"cancelled"` when the previous status was `"loading"`
- preserves existing successful data

Preserving the last successful result is important for UI continuity: cancelling a refresh does not require the UI to lose the data it was already displaying.

See [Query Cancellation](./cancellation.md).

---

## Workers and Transferables

With worker execution enabled, module-backed queries and mutations can execute away from the UI thread:

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

Modules are registered by URL, optionally with export configuration, through `pool.registerModule()` or a shared module registry.

### Default transport

Module input uses structured cloning by default.

### Transferable transport

Setting:

```js
transfer: true
```

opts into transferable transport.

Transferable values can be moved across worker boundaries rather than cloned. Supported values include:

- `ArrayBuffer`
- `MessagePort`
- `ImageBitmap`
- `OffscreenCanvas`
- underlying buffers of typed arrays
- underlying buffers of `DataView`

Because transferring an object detaches it from the sender, transferable input is not cached for reuse.

See [Query Pool and Workers](./workers.md), [Query Registry](./registry.md), and [Transferable Data](./transfers.md).

---

## Reactivity

Query and mutation state is backed by Udodi's reactive system.

Reading a handle field such as `data`, `loading`, or `status` inside an effect, computed value, or template establishes a dependency on that field. When execution changes the corresponding state, only consumers that depend on that state are eligible to react.

```js
const label = computed(() => {
  if (users.loading) {
    return "Loading…";
  }

  if (users.error) {
    return "Failed";
  }

  return `Users: ${(users.data ?? []).length}`;
});
```

Query data can also be updated directly through:

```js
pool.setQueryData("users", value);
```

This changes the reactive query data without executing the query's `source()` or worker module. Mutations use this capability for optimistic updates and rollback.

---

## Pool Lifecycle

A pool can optionally own worker infrastructure:

```js
const pool = createQueryPool({
  worker: {
    enabled: true,
    computeWorkers: 2,
  },
});

// Register queries and mutations...
// Execute work...

pool.terminate();
```

`terminate()`:

- cancels in-flight mutations
- terminates the worker bridge when present
- releases worker infrastructure

Query handles remain as JavaScript objects after pool termination. Use `reset()` or drop references when their state should also be cleared.

Registering a query starts its initial execution plan, including its dependencies. Failures during this initial execution are swallowed so that registration itself does not reject; the resulting failure remains observable through the query handle's reactive `status` and `error`.

---

## Mental Model

The Query Pool is easiest to understand as four coordinated layers:

```text
┌─────────────────────────────────────────────┐
│              Registration                   │
│                                             │
│ query() / mutation()                        │
│ definitions + dependency relationships      │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│           Execution Planning                │
│                                             │
│ dependency graph → execution waves          │
│ parallel branches + in-flight reuse         │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│                 Execution                   │
│                                             │
│ cache → run → cancellation → worker bridge  │
│ invalidation → refresh                      │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│              Reactive State                 │
│                                             │
│ data · error · loading · status · chunks    │
└─────────────────────────────────────────────┘
```

### 1. Registration

`query()` and `mutation()` define asynchronous work units and their optional relationships.

### 2. Execution planning

The dependency graph determines which work must run first and which independent branches can execute concurrently.

### 3. Execution

Individual runs coordinate caching, in-flight reuse, forced execution, cancellation, and optional worker transport.

### 4. Reactive state

Handles expose execution results and lifecycle state so the UI can react without maintaining separate request bookkeeping.

Caching, invalidation, dependent cascades, and transferable transport all support these four layers. They do not turn Query Pool into a general-purpose application-state store.

---

## Query Pool vs Store

The distinction can be summarized as application state versus asynchronous lifecycle state:

```text
┌──────────────────────┐       ┌─────────────────────────┐
│      Udodi Store     │       │       Query Pool        │
├──────────────────────┤       ├─────────────────────────┤
│ client-owned state   │       │ asynchronous work       │
│ theme                │       │ server data             │
│ locale               │       │ request lifecycle       │
│ drafts               │       │ caching                 │
│ feature flags        │       │ invalidation            │
│ shared UI state      │       │ refresh                 │
│ persistence          │       │ mutations               │
│                      │       │ worker execution        │
└──────────────────────┘       └─────────────────────────┘
```

The two systems can work together.

For example, a mutation can update Store state after an asynchronous operation succeeds, while Query Pool continues to own the request lifecycle and related query invalidation.

The important rule is not "never call APIs from the Store" or "never update the Store from Query Pool." The rule is to keep each system responsible for the state and lifecycle it actually owns.

---

## Core Principles

### 1. Give state a clear owner

Use component state for component-owned concerns, Store for shared client state, and Query Pool for asynchronous work and its lifecycle.

### 2. Treat the pool as an ownership boundary

Queries, mutations, dependencies, cache, in-flight execution, and worker infrastructure belong to the pool that created them.

### 3. Model relationships explicitly

Use `dependsOn` when one query genuinely depends on another. Let the execution planner coordinate ordering and parallelism instead of manually chaining unrelated fetches.

### 4. Let the pool own request lifecycle

Use the query and mutation handles for loading, error, status, cancellation, refresh, and reset rather than duplicating that bookkeeping in component state.

### 5. Cache asynchronous results deliberately

Query caching exists to control repeated asynchronous execution and freshness. It is not a replacement for application-state storage.

### 6. Invalidate instead of manually synchronizing stale queries

When a mutation changes data represented by queries, use invalidation to mark affected queries stale and coordinate their refresh.

### 7. Keep cancellation explicit

Pass the provided `AbortSignal` into cancellable asynchronous work so `cancel()` can actually terminate the underlying operation.

### 8. Use workers for work that benefits from isolation

Worker modules are an execution mechanism for asynchronous computation, not a separate state system.

### 9. Use transferables deliberately

Transferable transport can avoid structured-clone costs for large binary values, but transferred objects become detached from the sender and therefore cannot be treated as reusable cached input.

---

## Next Steps

| Goal | Guide |
| --- | --- |
| Create and execute queries | [Queries](./queries.md) |
| Understand query status and transitions | [Query Lifecycle](./lifecycle.md) |
| Register worker modules | [Query Registry](./registry.md) |
| Perform asynchronous writes | [Mutations](./mutations.md) |
| Connect queries into a dependency graph | [Query Dependencies](./dependencies.md) |
| Control cache freshness | [Caching](./caching.md) |
| Invalidate and refresh queries | [Invalidation](./invalidation.md) |
| Understand dependency execution order | [Query Scheduling](./scheduling.md) |
| Stop in-flight work | [Query Cancellation](./cancellation.md) |
| Run work off the UI thread | [Query Pool and Workers](./workers.md) |
| Transfer large binary values | [Transferable Data](./transfers.md) |

The [Query Pool API Reference](../api/query-pool.md) is the authoritative source for exact signatures, options, and return values.
