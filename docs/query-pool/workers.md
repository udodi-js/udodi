# Query Pool and Workers

The Query Pool can execute module-backed queries and mutations off the UI thread through a worker runtime composed of a **Worker Bridge**, a **Main Worker**, and a configurable **Compute Worker Pool**.

Workers are an execution backend, not a second state-management system. The Query Pool remains responsible for reactive state, lifecycle, caching, dependency plans, invalidation, cancellation, and committing results. The worker runtime only moves the execution of registered modules away from the application thread.

This separation is important:

```text
                      Application Thread
┌──────────────────────────────────────────────────────────────┐
│                         Query Pool                           │
│                                                              │
│  reactive state   lifecycle      cache   dependencies        │
│  invalidation     cancellation   execution identity          │
│                                                              │
│       ┌──────────────────────┐                               │
│       │ local source/execute │                               │
│       └──────────────────────┘                               │
│                    │                                         │
│                    │ module-backed work                      │
│                    ▼                                         │
│              Worker Bridge                                   │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
              ┌─────────────┐
              │ Main Worker │
              └──────┬──────┘
                     │
             ┌───────┼───────┐
             ▼       ▼       ▼
            C1      C2      C3
         Compute  Compute  Compute
         Worker   Worker   Worker
```

The UI thread therefore does not become responsible for worker lifecycle or worker state. It interacts with the same query and mutation handles regardless of whether execution is local or worker-backed.

For module registration, see [Query Registry](./registry.md). For zero-copy transport, see [Transferable Data](./transfers.md).

---

## When to Use Workers

Worker execution is most useful when the execution itself is expensive.

Good candidates include:

- CPU-heavy sorting, parsing, encoding, transformation, or calculation
- large data processing
- long-running computation that would otherwise block rendering
- progressive computation where streamed results are useful
- large binary payloads that benefit from transferable transport
- work that should be isolated from the UI thread

A worker is usually unnecessary for a simple network request whose expensive part is waiting for the server:

```js
const users = pool.query("users", {
  source: async (signal) => {
    const response = await fetch("/api/users", { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
});
```

The network request above is naturally asynchronous and does not need a worker merely because it is asynchronous.

A useful distinction is:

```text
              Is the expensive part...?
                         │
              ┌──────────┴──────────┐
              │                     │
             I/O                   CPU
              │                     │
              ▼                     ▼
       local source/execute     worker module
```

Workers are therefore about **where computation executes**, not about whether an operation returns a promise.

---

## Worker Architecture

When worker execution is enabled, module-backed work follows this architecture:

```text
  Application / UI Thread
           │
           ▼
    ┌─────────────┐
    │ Query Pool  │
    └──────┬──────┘
           │
           ▼
   ┌───────────────┐
   │ Worker Bridge │
   └───────┬───────┘
           │
           ▼
    ┌─────────────┐
    │ Main Worker │
    └──────┬──────┘
           │
           ▼
 ┌───────────────────┐
 │ Compute Worker    │
 │      Pool         │
 └───┬─────┬─────┬───┘
     │     │     │
     ▼     ▼     ▼
    C1    C2    C3
```

Each layer has a distinct responsibility:

| Layer | Responsibility |
| --- | --- |
| Query Pool | Query/mutation handles, reactive state, lifecycle, plans, cache, invalidation, cancellation |
| Worker Bridge | Communication between the Query Pool and worker runtime; module synchronization, execution, abort, and stream transport |
| Main Worker | Coordinates worker execution and module registration |
| Compute Worker Pool | Executes registered modules |

This gives Udodi a useful separation:

```text
Query Pool
    │
    ├── "What should execute?"
    ├── "When should it execute?"
    ├── "Is cached data usable?"
    ├── "Is this execution still current?"
    └── "What reactive state should the UI see?"
             │
             ▼
        Worker Runtime
             │
             └── "Execute this module."
```

---

## Enabling Workers

Enable the worker backend when creating the pool:

```js
import { createQueryPool } from "udodi";

const pool = createQueryPool({
  worker: {
    enabled: true,
    computeWorkers: 2,
  },
});
```

The important options are:

| Option | Role |
| --- | --- |
| `enabled` | Enables worker execution for module-backed queries and mutations |
| `computeWorkers` | Controls the Compute Worker Pool size |

Registering a module does **not** by itself enable worker execution.

```js
pool.registerModule("heavySort", {
  url: new URL("./workers/sort.js", import.meta.url).href,
});
```

The module can be registered, but the pool still needs worker execution enabled before a module-backed definition can execute through the worker backend.

---

## Registering a Worker Module

A worker module is registered with a module key and descriptor:

```js
pool.registerModule("heavySort", {
  url: new URL("./workers/sort.js", import.meta.url).href,
});
```

The query then refers to the module by key:

```js
const sorted = pool.query("sorted", {
  module: "heavySort",
});

await sorted.fetch({
  input: items,
});
```

The application does not create or communicate with `Worker` instances directly.

Instead:

```text
sorted.fetch()
      │
      ▼
 Query Pool
      │
      ▼
 Worker Bridge
      │
      ▼
 Main Worker
      │
      ▼
 Compute Worker
      │
      ▼
 module execution
```

This means the query retains the same API whether its execution is local or worker-backed.

---

## Worker Module Files

The registered URL identifies the module that the worker runtime loads.

For example:

```js
// workers/sort.js

export async function query(input) {
  return [...input].sort((a, b) => a.score - b.score);
}
```

The query definition references the registered module rather than importing the implementation into the UI-side query definition:

```js
pool.registerModule("heavySort", {
  url: new URL("./workers/sort.js", import.meta.url).href,
});

const sorted = pool.query("sorted", {
  module: "heavySort",
});

await sorted.fetch({
  input: items,
});
```

The exact exported function used by a module can be configured through the module descriptor. See [Query Registry](./registry.md) for module descriptors and export configuration.

---

## Worker Queries

A worker-backed query uses `module` instead of a local `source`:

```js
const sorted = pool.query("sorted", {
  module: "heavySort",
});

await sorted.fetch({
  input: items,
});
```

A local query looks like this:

```js
const users = pool.query("users", {
  source: async (signal) => {
    const response = await fetch("/api/users", { signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },
});
```

The distinction is:

| | Local query | Worker query |
| --- | --- | --- |
| Definition | `source` | `module` |
| Execution | Application thread | Compute Worker |
| Reactive handle | Query Pool | Query Pool |
| Cache | Query Pool | Query Pool |
| Dependencies | Query Pool | Query Pool |
| Cancellation | Query Pool | Query Pool + worker bridge |
| Input transport | Direct | Structured clone or transfer |

Do not combine a worker module with a local `source` / `compute` on the same query definition.

---

## Worker Mutations

The same worker backend can execute mutations:

```js
pool.registerModule("saveUser", {
  url: new URL("./workers/save-user.js", import.meta.url).href,
});

const saveUser = pool.mutation("saveUser", {
  module: "saveUser",
  invalidates: ["users"],
});

await saveUser.mutate({
  name: "Attamah",
});
```

The mutation remains a normal Query Pool mutation:

```text
mutate(input)
     │
     ▼
Query Pool
     │
     ├── lifecycle
     ├── cancellation
     ├── optimistic hooks
     └── invalidation
             │
             ▼
       Worker Bridge
             │
             ▼
        Worker module
```

Only the mutation's execution body moves into the worker runtime.

---

## Local and Worker Work Can Coexist

A pool does not need to choose one execution backend for everything.

For example:

```js
const pool = createQueryPool({
  worker: {
    enabled: true,
    computeWorkers: 2,
  },
});

const users = pool.query("users", {
  source: fetchUsers,
});

const sortedUsers = pool.query("sortedUsers", {
  dependsOn: ["users"],
  module: "heavySort",
});
```

Here:

```text
users
  │
  │ local source
  ▼
Query Pool
  │
  │ dependency satisfied
  ▼
sortedUsers
  │
  │ worker module
  ▼
Compute Worker
```

This is one of the important architectural properties of the worker backend: worker execution is **per definition**, not a separate Query Pool.

---

## Execution Path

For a worker-backed query:

```js
const sorted = pool.query("sorted", {
  module: "heavySort",
});

await sorted.fetch({
  input: items,
});
```

the execution path is approximately:

```text
    fetch({ input })
           │
           ▼
┌─────────────────────┐
│ Query Pool runSelf  │
└──────────┬──────────┘
           │
           ├── status → loading
           ├── execution ID
           ├── AbortController
           ├── cache / in-flight checks
           │
           ▼
┌─────────────────────┐
│    Worker Bridge    │
└──────────┬──────────┘
           │
           ├── synchronize module
           │
           ▼
┌─────────────────────┐
│     Main Worker     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Compute Worker    │
│                     │
│  heavySort(input)   │
└──────────┬──────────┘
           │
           ▼
     result / error
     / stream chunks
           │
           ▼
┌─────────────────────┐
│   Worker Bridge     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│     Query Pool      │
│                     │
│  commit if current  │
└─────────────────────┘
```

The final execution-identity check is important. A worker may finish after its query has already been cancelled or superseded. Its result must not overwrite the state produced by a newer execution.

---

## Module Synchronization

Worker modules are registered through the Query Pool registry rather than manually imported by every Compute Worker.

The worker bridge synchronizes the module descriptor with the worker runtime when necessary.

Conceptually:

```text
pool.registerModule()
        │
        ▼
   module registry
        │
        ▼
 worker bridge sync
        │
        ▼
   Main Worker
        │
        ▼
 Compute Workers
```

This allows the Query Pool to keep module registration centralized while the worker runtime handles execution.

For the complete registration model, including descriptors and export names, see [Query Registry](./registry.md).

---

## Streaming

Worker modules can produce progressive results when streaming is enabled:

```js
const report = pool.query("report", {
  module: "generateReport",
  stream: true,
});

const run = report.fetch({
  input: {
    title: "Q1",
  },
});

await run;
```

While the execution is running, the query exposes reactive streaming state:

```js
report.loading;
report.streaming;
report.streamed;
report.chunks;
```

A UI can react directly to those fields:

```js
const progress = computed(() => {
  if (!report.loading) {
    return "Complete";
  }

  return report.streamed
    ? `${report.chunks.length} chunks received`
    : "Starting...";
});
```

The lifecycle is:

```text
execution starts
      │
      ▼
loading = true
streaming = true
chunks = []
streamed = false
      │
      ├──── chunk ────► chunks
      │                 streamed = true
      │
      ├──── chunk ────► chunks
      │
      └──── stream end
                │
                ▼
         streaming = false
                │
                ▼
          success / error
```

Chunks belong to the execution that produced them. Chunks arriving from a superseded execution are ignored.

See [Query Lifecycle](./lifecycle.md) for the complete streaming lifecycle.

---

## Transferable Data

Worker communication uses structured cloning by default.

For large transferable values, transport can be explicitly enabled:

```js
const sorted = pool.query("sorted", {
  module: "heavySort",
});

await sorted.fetch({
  input: largeBuffer,
  transfer: true,
});
```

With transfer enabled, supported transferable objects are moved across the worker boundary instead of being cloned.

For example:

```js
const buffer = new ArrayBuffer(50 * 1024 * 1024);

await sorted.fetch({
  input: buffer,
  transfer: true,
});
```

The important distinction is:

```text
Structured clone
────────────────
UI object
    │
    ├── copy
    ▼
Worker object


Transfer
────────
UI object
    │
    └───────────► Worker object
                    │
                    └── original becomes detached
```

Because transfer changes ownership, transferred input should not be treated as reusable cached input on the application thread.

See [Transferable Data](./transfers.md) for supported transferable types and transport rules.

### Transfer Across the Worker Pipeline

Transferable transport is especially relevant because module execution can cross more than one worker boundary.

Conceptually:

```text
UI Thread
    │
    │ transfer
    ▼
Worker Bridge
    │
    ▼
Main Worker
    │
    │ transfer
    ▼
Compute Worker
```

A transferable object is not magically available to every boundary after the first transfer. Once ownership has moved, the receiving side must transfer it again when another worker boundary requires it.

This is why transferable handling is part of the Query Pool worker transport rather than something application code needs to coordinate manually.

See [Transferable Data](./transfers.md) for the detailed transport model.

---

## Caching Still Happens in the Query Pool

Worker execution does not create a separate worker cache.

For example:

```js
const sorted = pool.query("sorted", {
  module: "heavySort",
  cache: {
    ttl: 60_000,
  },
});
```

The decision to use the cache happens before the worker module needs to execute:

```text
sorted.fetch()
      │
      ▼
 Query Pool
      │
      ├── fresh cache?
      │      │
      │     yes ─────► return cached data
      │      │
      │ ◄─── no
      │
      ▼
 Worker execution
      │
      ▼
   result
      │
      ▼
 Query Pool cache
```

Thus a fresh cache entry can prevent an expensive worker invocation altogether.

The worker backend does not alter the Query Pool's caching semantics.

See [Caching](./caching.md).

---

## Dependencies and Workers

Worker queries participate in dependency plans like local queries.

```js
pool.query("raw", {
  source: fetchRaw,
});

pool.query("processed", {
  dependsOn: ["raw"],
  module: "processRaw",
});
```

Refreshing the dependent query produces a plan such as:

```text
refresh("processed")
        │
        ▼
      raw
        │
        │ dependency satisfied
        ▼
   processed
        │
        ▼
  worker module
```

The dependency graph remains on the Query Pool.

The worker only executes the body of `processed`.

This means all of the normal plan rules still apply:

- dependencies execute before dependents
- independent branches can execute in parallel
- fresh cache entries can short-circuit execution
- in-flight work can be reused
- `force` can require a fresh execution
- cancellation and execution identity prevent stale results from committing

See [Query Dependencies](./dependencies.md).

---

## Cancellation

Worker-backed execution uses the same cancellation API as local execution:

```js
const report = pool.query("report", {
  module: "generateReport",
  stream: true,
});

const request = report.fetch({
  input: options,
});

report.cancel();
```

Cancellation proceeds through the Query Pool:

```text
report.cancel()
       │
       ▼
advance execution ID
       │
       ▼
abort AbortController
       │
       ▼
signal Worker Bridge
       │
       ▼
worker execution is stopped
or becomes irrelevant
       │
       ▼
late result cannot commit
```

The important guarantee is not merely that the worker stops immediately. The stronger guarantee is that a superseded execution cannot commit stale state.

After cancellation:

```js
report.loading;   // false
report.streaming; // false
report.status;    // "cancelled" if it was loading
```

Existing successful data remains available.

See [Query Cancellation](./cancellation.md).

---

## Worker Errors

Worker execution errors become normal Query Pool execution errors.

```js
const sorted = pool.query("sorted", {
  module: "heavySort",
});

try {
  await sorted.fetch({
    input: items,
  });
} catch (error) {
  console.error(error);
}
```

The handle reflects the failure reactively:

```js
sorted.status;  // "error"
sorted.loading; // false
sorted.error;   // worker execution error
```

The Query Pool therefore keeps the same error contract regardless of whether execution was local or worker-backed.

```text
local source ────────┐
                     │
                     ▼
                 Query Pool
                     │
                     ▼
                 same handle
                     ▲
                     │
worker module ───────┘
```

---

## Worker Concurrency

The Compute Worker Pool allows multiple module executions to be processed concurrently.

For example:

```js
const pool = createQueryPool({
  worker: {
    enabled: true,
    computeWorkers: 3,
  },
});
```

Conceptually:

```text
                Main Worker
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
       Worker 1   Worker 2   Worker 3
          │          │          │
        Job A      Job B      Job C
```

If more work is ready than there are workers, the worker runtime controls how execution is assigned to the available Compute Workers.

This is particularly useful for dependency graphs containing independent worker-backed branches:

```text
             root plan
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
        A        B        C
        │        │        │
     Worker 1  Worker 2  Worker 3
```

The Query Pool still determines which nodes are ready; the Compute Worker Pool provides the execution capacity.

---

## Worker Execution Does Not Change Reactivity

A worker query is still an ordinary reactive Query Pool handle:

```js
const sorted = pool.query("sorted", {
  module: "heavySort",
});
```

A computed value can consume it normally:

```js
const summary = computed(() => {
  if (sorted.loading) return "Sorting…";
  if (sorted.error) return "Sorting failed";

  return `Items: ${(sorted.data ?? []).length}`;
});
```

The UI does not need to know whether `heavySort` executes locally or in a Compute Worker.

That is a deliberate abstraction:

```text
                 Query Handle
                      │
          ┌───────────┴───────────┐
          │                       │
      local source          worker module
          │                       │
          └───────────┬───────────┘
                      ▼
                same reactive
                    API
```

---

## Local vs Worker Execution

| | Local | Worker |
| --- | --- | --- |
| Query execution | `source` | `module` |
| Query transform | `compute` | module implementation |
| Mutation execution | `execute` | `module` |
| Execution thread | Application thread | Compute Worker |
| Reactive state | Query Pool | Query Pool |
| Cache | Query Pool | Query Pool |
| Dependencies | Query Pool | Query Pool |
| Invalidation | Query Pool | Query Pool |
| Cancellation | `AbortSignal` | Query Pool + worker bridge |
| Streaming | Local execution path | Worker stream transport |
| Input transport | Direct | Structured clone by default |
| Transferable input | Not applicable to worker transport | `transfer: true` |
| Worker infrastructure | None | Main Worker + Compute Worker Pool |

The choice therefore belongs to the work definition, not to the reactive consumer.

---

## Choosing Between Local and Worker Execution

A useful rule is:

```text
Is the operation primarily I/O?

       │
      yes
       │
       ▼
   local source


       no
       │
       ▼
Is the operation CPU-heavy or long-running?

       │
      yes
       │
       ▼
   worker module
```

For example, fetching data:

```js
pool.query("users", {
  source: fetchUsers,
});
```

while processing a large dataset:

```js
pool.query("processedUsers", {
  module: "processUsers",
});
```

The two can then be connected:

```js
pool.query("users", {
  source: fetchUsers,
});

pool.query("processedUsers", {
  dependsOn: ["users"],
  module: "processUsers",
});
```

This gives the application a single asynchronous graph while allowing each node to use the execution backend appropriate to its workload.

---

## Worker Lifecycle

Worker infrastructure belongs to the lifetime of the Query Pool.

```js
const pool = createQueryPool({
  worker: {
    enabled: true,
    computeWorkers: 2,
  },
});

// register and use queries / mutations

pool.terminate();
```

`terminate()` tears down the worker infrastructure and cancels in-flight mutations as part of pool disposal.

It is therefore appropriate when the entire pool is no longer needed:

```text
createQueryPool()
       │
       ▼
 worker infrastructure
       │
       ├── queries
       ├── mutations
       └── worker modules
       │
       ▼
pool.terminate()
       │
       ▼
 worker infrastructure released
```

Do not use `terminate()` as a replacement for ordinary query cancellation. Use:

```js
query.cancel();
```

when only one execution should stop.

---

## Complete Example

The following example combines worker execution, caching, dependencies, and streaming:

```js
import { createQueryPool } from "udodi";

const pool = createQueryPool({
  worker: {
    enabled: true,
    computeWorkers: 2,
  },
});

pool.registerModule("heavySort", {
  url: new URL("./workers/sort.js", import.meta.url).href,
});

pool.registerModule("generateReport", {
  url: new URL("./workers/report.js", import.meta.url).href,
});

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

const sortedUsers = pool.query("sortedUsers", {
  dependsOn: ["users"],
  module: "heavySort",

  cache: {
    ttl: 30_000,
  },
});

const report = pool.query("report", {
  dependsOn: ["sortedUsers"],
  module: "generateReport",
  stream: true,
});

// Dependency plan:
// users → sortedUsers → report

await report.fetch({
  input: {
    title: "Users Report",
  },
});

// report.chunks contains streamed worker output.
// report.data contains the final committed result.

pool.terminate();
```

The resulting architecture is:

```text
             Query Pool
                  │
                  ▼
                users
                  │
            local source
                  │
                  ▼
             sortedUsers
                  │
            worker module
                  │
                  ▼
               report
                  │
            worker module
                  │
                  ▼
           Compute Workers
```

The key point is that the dependency graph, cache, lifecycle, and reactive state remain centralized in the Query Pool, while the expensive module executions are distributed to the worker backend.

---

## Worker Design Principles

The worker subsystem follows a few important principles:

### 1. Workers are execution, not state

Do not treat Compute Workers as another reactive store.

The Query Pool owns:

- `data`
- `error`
- `loading`
- `status`
- cache
- dependencies
- invalidation
- execution identity

### 2. Worker modules are opt-in

Local queries remain simple:

```js
pool.query("users", {
  source: fetchUsers,
});
```

Worker execution is introduced only when needed:

```js
pool.query("sorted", {
  module: "heavySort",
});
```

### 3. Structured clone is the default

You do not need to manually construct transfer lists for ordinary data.

Use:

```js
transfer: true
```

when moving supported large transferable values is beneficial.

### 4. Cancellation is still coordinated by the Query Pool

The worker runtime does not become the source of truth for whether a result is allowed to commit.

Execution identity remains on the Query Pool side.

### 5. Reactive consumers do not care where execution occurs

The same:

```js
query.data
query.loading
query.error
query.status
```

API works for both local and worker-backed queries.

That keeps worker execution an implementation detail rather than a second programming model.

---

## API Summary

| Surface | Role |
| --- | --- |
| `createQueryPool({ worker })` | Enable and configure worker execution |
| `worker.enabled` | Enable the worker backend |
| `worker.computeWorkers` | Configure Compute Worker Pool capacity |
| `pool.registerModule()` | Register a worker module |
| `module: "key"` | Select a registered worker module |
| `stream: true` | Enable worker stream transport |
| `transfer: true` | Opt into transferable input transport |
| `cancel()` | Cancel the current execution |
| `pool.terminate()` | Tear down worker infrastructure |

---

## Next Steps

| Topic | Guide |
| --- | --- |
| Register worker modules | [Query Registry](./registry.md) |
| Transfer large binary values | [Transferable Data](./transfers.md) |
| Create module-backed queries | [Queries](./queries.md) |
| Create module-backed mutations | [Mutations](./mutations.md) |
| Understand cancellation | [Query Cancellation](./cancellation.md) |
| Understand dependency plans, in-flight reuse, and force | [Query Dependencies](./dependencies.md) |
| Understand streaming state | [Query Lifecycle](./lifecycle.md) |
| Overall architecture | [Query Pool Overview](./overview.md) |

For exact worker options, module descriptors, and message contracts, see the [Query Pool API Reference](../api/query-pool.md).
