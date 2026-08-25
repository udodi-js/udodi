# Query Registry

The Query Registry is the module registry used by the Query Pool to describe worker-backed query and mutation modules.

A registry does not execute queries, manage query state, cache results, or schedule dependencies. Its responsibility is narrower: it maps a module key to the information required to load that module inside the Compute Worker Pool.

This separation keeps module registration independent from query execution:

```text
┌───────────────────────┐
│    Query Registry     │
│                       │
│ "heavySort" → module  │
│ "encode"    → module  │
│ "search"    → module  │
└───────────┬───────────┘
            │ module descriptor
            ▼
┌───────────────────────┐
│      Query Pool       │
│                       │
│ query / mutation      │
│ execution + lifecycle │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│      Main Worker      │
│           │           │
│           ▼           │
│  Compute Worker Pool  │
└───────────────────────┘
```

**Public API:** applications register modules through the pool; `pool.registerModule()` and `pool.registerModules()`. Each pool owns an internal registry. `createQueryModuleRegistry` is not part of the public package export from `udodi`.

For the complete worker execution model, see [Query Pool and Workers](./workers.md).

---

## Why a Registry Exists

Worker-backed queries and mutations refer to modules by a logical key, rather than embedding a module URL directly into every definition.

For example:

```js
import { createQueryPool } from "udodi";

const pool = createQueryPool({
  worker: {
    enabled: true,
  },
});

pool.registerModule("heavySort", {
  url: new URL("./workers/sort.js", import.meta.url).href,
});
```

The query can then refer to the module by its registered key:

```js
const sorted = pool.query("sorted", {
  module: "heavySort",
});
```

The registry therefore provides an indirection:

```text
query definition
      │
      │ module: "heavySort"
      ▼
┌────────────────────┐
│   Query Registry   │
│                    │
│ heavySort ─────────┼──► module URL
└────────────────────┘
```

This is particularly useful when several queries or mutations use the same worker module.

---

## Registering a Module

Create a pool (with workers enabled for module-backed execution), then register modules under unique string keys:

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
```

The key is the identifier used by query and mutation definitions:

```js
const sorted = pool.query("sorted", {
  module: "heavySort",
});
```

The module URL identifies the worker module itself.

A typical project might therefore look like:

```text
src/
├── workers/
│   ├── sort.js
│   ├── search.js
│   └── encode.js
│
├── queries/
│   └── users.js
│
└── app.js
```

Registration can centralize the worker module descriptors:

```js
pool.registerModule("heavySort", {
  url: new URL("./workers/sort.js", import.meta.url).href,
});

pool.registerModule("search", {
  url: new URL("./workers/search.js", import.meta.url).href,
});

pool.registerModule("encode", {
  url: new URL("./workers/encode.js", import.meta.url).href,
});
```

### Batch registration

```js
pool.registerModules({
  heavySort: {
    url: new URL("./workers/sort.js", import.meta.url).href,
  },
  search: {
    url: new URL("./workers/search.js", import.meta.url).href,
  },
  encode: {
    url: new URL("./workers/encode.js", import.meta.url).href,
  },
});
```

---

## Module Descriptors

A registered module is represented by a descriptor containing its worker module URL and, where supported, the export information required to invoke it.

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | string | yes | Module URL loaded by the Compute Worker. |
| `queryExport` | string | no | Named export of the query function. Defaults to `"query"`. |
| `defaultExport` | string \| null | no | Property name on the module’s default export object, or `null`. |
| `metadata` | object | no | Optional serializable metadata. |

Conceptually:

```js
{
  url: "...",
  queryExport: "query",
  defaultExport: null,
  metadata: undefined,
  revision: 1,
}
```

The registry stores this descriptor under its key:

```text
"heavySort"
      │
      ▼
{
  url: ".../workers/sort.js",
  queryExport: "query",
  ...
}
```

### Export conventions

A worker module may expose the query function as a named export (default name `"query"`):

```js
// workers/sort.js
export async function query(context) {
  return sorted;
}
```

Or as a property on the default export:

```js
// workers/report.js
export default {
  generate: async function query(context) {
    return report;
  },
};
```

In the latter case, set `defaultExport` (and optionally `queryExport`) on the definition.

The registry does not import the module on the UI thread. Module loading and execution belong to the worker runtime.

This distinction is important:

```text
UI thread
   │
   │ registerModule()
   ▼
Registry
   │
   │ descriptor
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
   └── loads / executes module
```

Each successful registration assigns a new **revision** to the descriptor. The worker bridge uses that revision to decide whether to re-sync the module before execution. See [Query Pool and Workers](./workers.md).

---

## Using a Registry with a Query

Once a module has been registered, a query can reference it:

```js
pool.registerModule("heavySort", {
  url: new URL("./workers/sort.js", import.meta.url).href,
});

const sorted = pool.query("sorted", {
  module: "heavySort",
});
```

The query itself does not need a local `source`:

```js
// Local query
pool.query("users", {
  source: fetchUsers,
});

// Worker-backed query
pool.query("sorted", {
  module: "heavySort",
});
```

A definition uses either the local execution path or the worker-module path.

```text
Query definition
      │
      ├── source / compute
      │       │
      │       └── UI-thread execution
      │
      └── module
              │
              └── worker execution
```

A worker-backed definition must not combine `module` with a local `source` / `compute` execution definition.

---

## Using a Registry with Mutations

The same registry can provide modules for mutations:

```js
pool.registerModule("saveUser", {
  url: new URL("./workers/save-user.js", import.meta.url).href,
});

const saveUser = pool.mutation("saveUser", {
  module: "saveUser",
  invalidates: ["users"],
});
```

This allows queries and mutations to share a common module registry:

```text
                    Query Registry
                         │
             ┌───────────┴───────────┐
             │                       │
          Queries                 Mutations
             │                       │
             ▼                       ▼
       "heavySort"               "saveUser"
             │                       │
             └───────────┬───────────┘
                         ▼
                 Worker execution
```

The registry does not distinguish whether a module will ultimately be used by a query or mutation. It simply provides the module descriptor associated with the key.

---

## Registry and Worker Configuration

Registering a module does not by itself enable worker execution.

The Query Pool must have workers enabled:

```js
const pool = createQueryPool({
  worker: {
    enabled: true,
    computeWorkers: 2,
  },
});

pool.registerModule("heavySort", {
  url: new URL("./workers/sort.js", import.meta.url).href,
});
```

If worker execution is disabled, a query that references `module` cannot execute through the worker runtime.

The distinction is:

```text
pool.registerModule()
        │
        ▼
module is known
        │
        ▼
worker.enabled?
   ┌────┴────┐
  yes       no
   │         │
   ▼         ▼
execute    module
in worker  execution unavailable
```

Therefore, registration and execution configuration are separate concerns.

---

## Module Registration Before Query Creation

Register worker modules before creating definitions that reference them:

```js
const pool = createQueryPool({
  worker: { enabled: true },
});

pool.registerModule("heavySort", {
  url: new URL("./workers/sort.js", import.meta.url).href,
});

const sorted = pool.query("sorted", {
  module: "heavySort",
});
```

This makes the module dependency explicit before the query's initial execution plan begins. The pool resolves the module key when the query is registered; a missing module fails at that point.

The order is therefore:

```text
create pool
      │
      ▼
register module(s)
      │
      ▼
create query / mutation
      │
      ▼
initial execution
```

---

## Looking Up and Removing Modules

The pool exposes module lookup and removal:

```js
const descriptor = pool.getModule("heavySort");

pool.removeModule("heavySort");
```

These are module-resolution operations, not query execution.

| Method | Description |
| --- | --- |
| `pool.registerModule(key, definition)` | Register or replace a module; returns the descriptor. |
| `pool.registerModules(definitions)` | Register many modules from an object map. |
| `pool.getModule(key)` | Descriptor or `undefined`. |
| `pool.removeModule(key)` | Remove a module; returns whether it existed. |

Removing a module does not cancel or destroy queries that already reference it. Later executions that need the module will fail if it is no longer registered.

---

## Registry vs Query Pool

It is useful to keep the two responsibilities separate.

| Concern | Query Registry | Query Pool |
| --- | --- | --- |
| Register worker modules | Yes | Via `registerModule` / `registerModules` |
| Resolve module descriptors | Yes | Uses registry |
| Execute queries | — | Yes |
| Execute mutations | — | Yes |
| Reactive query state | — | Yes |
| Reactive mutation state | — | Yes |
| Dependency graph | — | Yes |
| Cache | — | Yes |
| In-flight deduplication | — | Yes |
| Invalidation | — | Yes |
| Cancellation | — | Yes |
| Worker lifecycle | — | Yes |
| Query lifecycle | — | Yes |

In short:

> The registry describes worker modules; the Query Pool manages the lifecycle of work that uses them.

---

## Registry Does Not Replace the Worker Pool

The Query Registry should not be confused with the Compute Worker Pool.

They operate at different layers:

```text
Application
     │
     ▼
Query Pool
     │
     ├── queries
     ├── mutations
     ├── dependencies
     ├── cache
     └── lifecycle
     │
     ▼
Query Registry (internal to the pool)
     │
     └── module descriptors
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

The registry does not schedule work between Compute Workers. Scheduling and execution belong to the worker runtime.

See [Query Pool and Workers](./workers.md) for the complete execution architecture.

---

## When to Register Modules

Module registration is particularly useful when:

- several queries use the same worker module
- queries and mutations share worker modules
- worker modules should be registered in one application-level location
- worker module URLs should be separated from query definitions

For a small application, registration can stay next to the pool:

```js
const pool = createQueryPool({
  worker: { enabled: true },
});

pool.registerModule("sort", {
  url: new URL("./workers/sort.js", import.meta.url).href,
});
```

For a larger application, registration can be centralized in a setup function:

```js
function registerWorkerModules(pool) {
  pool.registerModules({
    sort: {
      url: new URL("./workers/sort.js", import.meta.url).href,
    },
    search: {
      url: new URL("./workers/search.js", import.meta.url).href,
    },
    encode: {
      url: new URL("./workers/encode.js", import.meta.url).href,
    },
  });
}

const pool = createQueryPool({
  worker: {
    enabled: true,
    computeWorkers: 2,
  },
});

registerWorkerModules(pool);
```

This keeps application configuration separate from individual query definitions.

---

## Complete Example

The following example puts the pieces together:

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

pool.registerModule("saveUser", {
  url: new URL("./workers/save-user.js", import.meta.url).href,
});

const sortedUsers = pool.query("sortedUsers", {
  module: "heavySort",
  transfer: false,
});

const saveUser = pool.mutation("saveUser", {
  module: "saveUser",
  invalidates: ["users"],
});

await sortedUsers.fetch({
  input: users,
});

await saveUser.mutate({
  id: 1,
  name: "Ada",
});
```

The resulting architecture is:

```text
                     createQueryPool()
                            │
              ┌─────────────┴─────────────┐
              │                           │
        registerModule             registerModule
        "heavySort"                  "saveUser"
              │                           │
              └─────────────┬─────────────┘
                            │
                 ┌──────────┴──────────┐
                 │                     │
             Query                 Mutation
          sortedUsers              saveUser
                 │                     │
                 └──────────┬──────────┘
                            ▼
                      Worker Bridge
                            │
                            ▼
                       Main Worker
                            │
                            ▼
                  Compute Worker Pool
```

The important boundary is that the registry only defines how a module is identified and located. The Query Pool remains responsible for deciding when that module runs, tracking its reactive state, handling cancellation, coordinating dependencies, caching results, and processing invalidation.

---

## Next Steps

| Goal | Guide |
| --- | --- |
| Understand the overall worker architecture | [Query Pool and Workers](./workers.md) |
| Create worker-backed queries | [Queries](./queries.md) |
| Create worker-backed mutations | [Mutations](./mutations.md) |
| Understand dependency execution | [Query Dependencies](./dependencies.md) |
| Understand cancellation | [Query Cancellation](./cancellation.md) |
| Transfer large binary inputs | [Transferable Data](./transfers.md) |

The [Query Pool API Reference](../api/query-pool.md) remains the authoritative source for the exact registry-related APIs, signatures, module descriptor options, and return values.
