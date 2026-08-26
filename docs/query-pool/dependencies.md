# Query Dependencies

Query dependencies let a Query Pool express relationships between asynchronous operations. A query can declare that it depends on one or more other queries, causing the pool to execute those upstream queries before the dependent query.

Dependencies form a directed acyclic graph (DAG). The Query Pool builds an **execution plan** for the requested query, executes independent branches in **waves** (in parallel when possible), reuses **in-flight** work when appropriate, optionally short-circuits via **cache**, honors **`force`**, and can refresh **reverse dependents** after a successful run.

```text
             users
            /     \
           ▼       ▼
      userCount   userPosts
           \       /
            ▼     ▼
           dashboard
```

This makes dependencies useful when one piece of asynchronous data cannot be meaningfully computed until another query has completed.

For the broader Query Pool model, see [Query Pool Overview](./overview.md). For TTL short-circuits, see [Caching](./caching.md). For status transitions, see [Query Lifecycle](./lifecycle.md).

---

## Declaring a Dependency

A query declares upstream dependencies with `dependsOn`:

```js
const users = pool.query("users", {
  source: async (signal) => {
    const res = await fetch("/api/users", { signal });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
  },
});

const userCount = pool.query("userCount", {
  dependsOn: ["users"],

  source: async () => {
    return (pool.data("users") ?? []).length;
  },
});
```

The relationship is:

```text
users
  │
  ▼
userCount
```

When `userCount` executes through a dependency-aware plan, `users` is executed first. Once `users` succeeds, `userCount` can run and consume its data.

The dependency is expressed by **query key**, not by passing one query handle directly into another definition.

---

## Why Dependencies Exist

Without dependencies, application code would have to manually coordinate execution:

```js
await users.fetch();

await userCount.fetch();
```

This works for simple cases, but it makes the dependency relationship part of application control flow rather than part of the Query Pool's execution model.

With `dependsOn`:

```js
const userCount = pool.query("userCount", {
  dependsOn: ["users"],

  source: async () => {
    return (pool.data("users") ?? []).length;
  },
});
```

the pool owns the ordering:

```text
request userCount
       │
       ▼
   users ready?
    │       │
   no      yes
    │       │
    ▼       ▼
 execute   userCount
  users     execute
```

This becomes particularly valuable as graphs become larger.

---

## Multiple Dependencies

A query can depend on multiple upstream queries:

```js
const session = pool.query("session", {
  source: loadSession,
});

const permissions = pool.query("permissions", {
  source: loadPermissions,
});

const dashboard = pool.query("dashboard", {
  dependsOn: ["session", "permissions"],

  source: async () => {
    return {
      user: pool.data("session"),
      permissions: pool.data("permissions"),
    };
  },
});
```

The resulting graph is:

```text
session ──────┐
              ├──► dashboard
permissions ──┘
```

Both upstream queries must complete before `dashboard` can execute.

Importantly, independent dependencies do not need to execute sequentially:

```text
             ┌──► session ──────┐
dashboard ───┤                   ├──► dashboard
             └──► permissions ──┘


             independent branches
                    │
                    ▼
               run in parallel
```

The Query Pool schedules ready nodes in waves, allowing independent branches to execute concurrently.

---

## Dependency Chains

Dependencies can form multiple levels:

```js
const session = pool.query("session", {
  source: loadSession,
});

const profile = pool.query("profile", {
  dependsOn: ["session"],
  source: () => loadProfile(pool.data("session")),
});

const permissions = pool.query("permissions", {
  dependsOn: ["profile"],
  source: () => loadPermissions(pool.data("profile")),
});
```

The graph is:

```text
session
   │
   ▼
profile
   │
   ▼
permissions
```

Requesting `permissions` causes the pool to build the complete execution plan and run upstream-first:

```text
session → profile → permissions
```

The application therefore does not need to manually fetch each level.

---

## How Execution Is Scheduled

Dependencies define the **graph**. For each concrete request, the pool builds a **plan**, then runs each node through an internal **`runSelf`** path that decides whether to execute, reuse in-flight work, or satisfy from a fresh cache.

```text
request (fetch / refresh / registration / invalidation refresh)
        │
        ▼
  build execution plan
        │
        ├── membership (root ± dependencies ± dependents)
        ├── topological order / waves
        └── cycle detection
        │
        ▼
  for each ready wave
        │
        └── runSelf(node)
                │
                ├── force?           → execute
                ├── in-flight?       → reuse promise
                ├── fresh cache?     → reuse result
                └── otherwise        → execute source / module
```

### Entry points

| Operation | Role |
| --- | --- |
| Query registration | Starts an initial plan for the new key (includes upstream `dependsOn` when declared). |
| `query.refresh(options?)` | Dependency-aware plan using the query’s **last recorded input**. |
| `pool.refresh(key, options?)` | Same as handle `refresh`, by key. |
| `query.fetch(options?)` | Run with optional explicit **input**; may expand upstream with `dependencies: true`. |
| Mutation `invalidates` | After a successful write: mark targets stale, then schedule their refresh plans. |

```js
await dashboard.refresh();
await pool.refresh("dashboard");
await dashboard.fetch({ dependencies: true, force: true });
```

### fetch vs refresh

| | `fetch` | `refresh` |
| --- | --- | --- |
| Input | Explicit `options.input` (optional) | Last recorded input for the query |
| Plan | Self-only by default; add upstream with `dependencies: true` | Plan for this key (upstream dependencies included as required) |
| Typical use | First load or change of arguments | Reload with the same arguments |

```js
await posts.fetch({ input: { page: 2 } });
await posts.refresh(); // uses recorded page: 2

await dashboard.fetch({ dependencies: true });
await dashboard.refresh({ dependents: true, force: true });
```

---

## Building the Execution Plan

A dependency-aware execution starts by building a plan for the requested query.

Conceptually:

```text
requested query
       │
       ▼
build execution plan
       │
       ├── resolve dependencies
       ├── detect cycles
       └── determine execution order
       │
       ▼
execute ready nodes
       │
       ├── parallel branch
       ├── parallel branch
       └── ...
       │
       ▼
requested query
```

The pool resolves the dependency graph and rejects cyclic dependencies.

For example:

```text
A → B → C
```

is valid.

But:

```text
A → B → C → D
    ▲       │
    └───────┘
```

contains a cycle and cannot produce a valid execution plan.

---

## Cycles Are Rejected

Dependencies must form a DAG.

This is invalid:

```js
pool.query("a", {
  dependsOn: ["b"],
  source: loadA,
});

pool.query("b", {
  dependsOn: ["a"],
  source: loadB,
});
```

The graph is:

```text
a ───► b
▲      │
└──────┘
```

There is no valid upstream-first execution order because each query requires the other.

The Query Pool detects the cycle while building the execution plan and throws rather than attempting to execute an invalid graph.

### Longer cycles

Cycles can also occur across several queries:

```text
A → B → C
    ▲   │
    └───┘
```

Any dependency path that eventually points back to a query already being resolved forms a cycle.

---

## Execution Waves

The Query Pool executes dependency plans in waves.

Consider:

```text
          A
        /   \
       ▼     ▼
      B       C
       \     /
        ▼   ▼
          D
```

The execution waves are:

```text
Wave 1:        A

               │
          ┌────┴────┐
          ▼         ▼
Wave 2:   B         C

          └────┬────┘
               ▼
Wave 3:        D
```

`B` and `C` are independent of one another, so they can execute concurrently.

`D` waits until both are ready.

This is different from simply executing dependencies in array order:

```js
// Conceptually sequential — not how independent
// dependency branches need to be scheduled.
await B;
await C;
```

The execution planner instead identifies nodes that are ready at the same time and schedules those branches together.

---

## Self Execution vs Dependency Execution

The Query Pool separates executing a query itself from executing its dependency graph.

Conceptually:

```text
refresh("dashboard")
       │
       ▼
buildExecutionPlan()
       │
       ▼
executeExecutionPlan()
       │
       ├── runSelf("session")
       ├── runSelf("profile")
       └── runSelf("dashboard")
```

A dependency node is executed through its internal **`runSelf`** path rather than recursively calling its public `refresh()` method.

This distinction is important.

If every dependency simply called its own `refresh()`:

```text
refresh(A)
   │
   ▼
refresh(B)
   │
   ▼
refresh(C)
```

the dependency graph could recursively rebuild itself.

Instead, the pool builds **one** execution plan and executes its nodes directly:

```text
build once
    │
    ▼
execute plan
    │
    ├── runSelf(A)
    ├── runSelf(B)
    └── runSelf(C)
```

This keeps dependency execution deterministic and prevents graph recursion.

### runSelf decision path

For each plan node:

```text
runSelf(key)
    │
    ├── force? ──────────────────────────► execute (supersede prior run as needed)
    │
    ├── active in-flight promise? ───────► reuse promise
    │
    ├── cache configured and fresh? ─────► commit from cache
    │
    └── otherwise ───────────────────────► execute source / module
```

Outcomes update that query’s reactive lifecycle fields (`data`, `error`, `loading`, `status`, …). See [Query Lifecycle](./lifecycle.md).

---

## In-Flight Reuse

In-flight deduplication applies to **any** concurrent request for the same query—not only nodes inside a multi-query plan.

```js
const first = users.fetch();
const second = users.fetch();

await Promise.all([first, second]);
// often one underlying source/module invocation
```

When a plan needs a key that is already loading, the pool can attach to the same promise:

```js
const promise = users.fetch();
await userCount.refresh(); // may reuse users' in-flight work
```

```text
request A ──► start run ──► promise P
request B ──► see P in flight ──► await P
```

| Mechanism | When | What is reused |
| --- | --- | --- |
| In-flight | Concurrent runs of the same key | The active promise |
| Fresh cache | After a prior success within TTL | Stored result without calling source |

See [Caching](./caching.md).

---

## force

A plan normally reuses suitable in-flight work and may short-circuit on a fresh cache entry.

`force: true` requests a **new** execution instead of relying on those short-circuits:

```js
await dashboard.refresh({
  force: true,
});

await users.fetch({
  force: true,
  input: { page: 1 },
});
```

```text
without force
  in-flight? → reuse
  fresh cache? → reuse
  else → execute

with force
  → execute (typically supersedes the previous run for that query)
```

Forced runs generally increment the query’s execution identity and abort the previous controller so only the current run may commit state. See [Query Cancellation](./cancellation.md).

On mutations, `force` is primarily forwarded into **invalidation refreshes**:

```js
await createUser.mutate(input, { force: true });
```

---

## Dependency-Aware Execution

### refresh()

```js
await dashboard.refresh();
await pool.refresh("dashboard");
```

Runs the dependency execution plan for `dashboard`. For:

```text
session ──► profile ──► dashboard
```

refreshing `dashboard` causes the upstream chain to be considered before `dashboard` itself runs.

### fetch({ dependencies: true })

```js
await dashboard.fetch({
  dependencies: true,
});
```

Tells the pool to execute the dependency plan rather than treating the fetch as an isolated self-execution—useful when a particular call must evaluate upstream work as well.

### dependents

```js
await users.refresh({
  dependents: true,
});
```

Expands the plan with **reverse** dependents (queries that list this key in `dependsOn`). See [Reverse Dependents](#reverse-dependents).

---

## Dependency Failures

A dependency can fail before the dependent query executes.

```text
users
  │
  ✕ error
  │
  ▼
userCount
```

`userCount` cannot meaningfully execute if its required upstream query failed.

The Query Pool represents dependency failures with `QueryDependencyError` for affected plan nodes where appropriate.

This preserves a distinction between:

- the **original** error from the query that actually failed, and
- the dependency error observed by a query that could not proceed.

```js
const users = pool.query("users", {
  source: async () => {
    throw new Error("Users API unavailable");
  },
});

const userCount = pool.query("userCount", {
  dependsOn: ["users"],

  source: () => {
    return (pool.data("users") ?? []).length;
  },
});
```

The underlying failure remains `Error("Users API unavailable")` rather than being replaced by an unrelated generic error from the dependent query. That matters for cancellation and other root causes as well.

### Dependent queries do not succeed after a failed upstream node

```text
A ──✕
│
╳
B
│
C
```

`B` cannot complete as a successful dependency execution; `C` cannot rely on `B`.

Previous successful **data** on a dependent is not automatically destroyed. Lifecycle rules still govern each handle. See [Query Lifecycle](./lifecycle.md).

---

## Reading Dependency Data

A dependent query commonly reads the upstream result through the pool:

```js
const userCount = pool.query("userCount", {
  dependsOn: ["users"],

  source: async () => {
    const users = pool.data("users") ?? [];

    return users.length;
  },
});
```

```text
users
  │
  │ data
  ▼
userCount
```

Dependency ordering guarantees **execution order**; it does not change the value the upstream query returns. The dependent `source` still defines `userCount.data`.

---

## Multiple-Level Example

```js
const session = pool.query("session", {
  source: loadSession,
});

const profile = pool.query("profile", {
  dependsOn: ["session"],

  source: async () => {
    const session = pool.data("session");
    return loadProfile(session.userId);
  },
});

const permissions = pool.query("permissions", {
  dependsOn: ["session"],

  source: async () => {
    const session = pool.data("session");
    return loadPermissions(session.userId);
  },
});

const dashboard = pool.query("dashboard", {
  dependsOn: ["profile", "permissions"],

  source: async () => {
    return {
      profile: pool.data("profile"),
      permissions: pool.data("permissions"),
    };
  },
});
```

```text
                  session
                 /       \
                ▼         ▼
            profile   permissions
                \         /
                 ▼       ▼
                 dashboard
```

```text
              ┌─────────┐
              │ session │
              └────┬────┘
                   │
             ┌─────┴───────┐
             ▼             ▼
        ┌─────────┐ ┌──────────────┐
        │ profile │ │ permissions  │
        └────┬────┘ └──────┬───────┘
             │             │
             └──────┬──────┘
                    ▼
             ┌─────────────┐
             │  dashboard  │
             └─────────────┘
```

Only branches with no unresolved dependency run at each stage.

---

## Reverse Dependents

Dependencies normally describe the upstream relationship:

```text
users ──► userCount
```

The pool can also use the reverse relationship when dependent refresh is requested:

```js
await users.refresh({
  dependents: true,
});
```

```text
users
  │
  ├──► userCount
  │
  └──► userPosts
```

| Option | Role |
| --- | --- |
| `dependsOn` | Declares what **this** query requires (graph edge). |
| `dependents: true` | Whether queries that **require this query** should be scheduled in the plan. |

Invalidating a key alone does not expand dependents; expansion is a property of the **refresh plan**. See [Invalidation](./invalidation.md).

---

## Dependencies and Mutations

Mutations are **not** nodes in the query dependency graph. They affect the graph through invalidation after a successful write.

```js
const createUser = pool.mutation("createUser", {
  execute: createUserRequest,
  invalidates: ["users"],
});
```

```js
const updateUser = pool.mutation("updateUser", {
  execute: updateUserRequest,

  invalidates: [
    {
      key: "users",
      dependents: true,
      force: true,
    },
  ],
});
```

```text
mutation success
      │
      ▼
invalidate targets
      │
      ▼
schedule refresh plans  ← same plan / runSelf rules
```

See [Invalidation](./invalidation.md) and [Mutations](./mutations.md).

---

## Dependencies and Cache

Dependencies do not imply that every upstream query must perform a network request.

If an upstream query has a fresh cache entry, a plan can satisfy it without calling `source` / module:

```js
const users = pool.query("users", {
  source: loadUsers,
  cache: { ttl: 60_000 },
});
```

```text
execute dashboard
       │
       ▼
    users
       │
  cache fresh?
    │       │
   yes      no
    │       │
    ▼       ▼
 cached   execute
  data     source
    │       │
    └───┬───┘
        ▼
    dashboard
```

The graph determines **what must be available**; caching determines **whether availability requires new work**. Force bypasses the fresh-cache short-circuit. See [Caching](./caching.md).

---

## Dependencies and Cancellation

A dependency plan can be cancelled:

```js
const request = dashboard.refresh();

dashboard.cancel();

await request;
```

Cancellation supersedes the relevant in-flight execution. An abort should not be treated as an ordinary application/server failure.

Always pass the provided `AbortSignal` into cancellable work. See [Query Cancellation](./cancellation.md).

---

## Registering Dependencies Safely

Use stable, unique query keys:

```js
const users = pool.query("users", {
  source: loadUsers,
});

const userCount = pool.query("userCount", {
  dependsOn: ["users"],
  source: computeUserCount,
});
```

Avoid generating keys dynamically unless that key is intentionally part of the query’s identity.

The query key is used for dependency resolution, cache lookup, invalidation, `pool.get()`, `pool.data()`, and dependent scheduling.

Re-calling `pool.query` with an existing key returns the existing handle and does **not** replace the definition or `dependsOn`.

---

## Common Dependency Patterns

### Authentication → Profile

```text
session
   │
   ▼
profile
```

```js
const profile = pool.query("profile", {
  dependsOn: ["session"],

  source: async () => {
    const session = pool.data("session");
    return loadProfile(session.userId);
  },
});
```

### Catalog → Derived Results

```text
products
   │
   ├──► categories
   │
   └──► productCount
```

### Shared Upstream Data

```text
             session
            /   |   \
           ▼    ▼    ▼
       profile roles settings
```

### Fan-In

```text
profile ──────┐
              ├──► dashboard
permissions ──┘
```

### Multi-Level Fan-Out / Fan-In

```text
                  session
                 /       \
                ▼         ▼
            profile    permissions
              /  \          │
             ▼    ▼         ▼
          posts  teams  dashboard
             \    /          ▲
              \  /           │
               ▼             │
             summary ────────┘
```

---

## What Dependencies Do Not Do

Dependencies define **execution** relationships. They do not automatically:

- merge query data
- transform upstream results
- copy data into another query
- create application state
- replace caching
- make unrelated queries reactive to one another

```js
const userCount = pool.query("userCount", {
  dependsOn: ["users"],

  source: () => {
    return (pool.data("users") ?? []).length;
  },
});
```

`dependsOn` establishes `users → userCount`. The `source` still determines what `userCount.data` becomes.

---

## Dependency Graph vs State Graph

**Dependency graph:**

```text
users ──► userCount
```

means: `userCount` requires `users` to be executed or satisfied before its own execution.

**Reactive relationship:**

```text
users.data ──► consumer
```

means: a reactive consumer read `users.data` and will respond when that value changes.

These are independent. Reading query data does not create a `dependsOn` edge; declaring `dependsOn` does not require a component to subscribe to the upstream handle.

---

## Best Practices

### Keep dependencies about execution

```js
const profile = pool.query("profile", {
  dependsOn: ["session"],
  source: loadProfileFromSession,
});
```

### Avoid artificial dependencies

Do not add `dependsOn: ["users"]` merely because two queries appear in the same component. A dependency should be a real execution prerequisite.

### Keep graphs directed and acyclic

Prefer `A → B → C` over mutual dependence.

### Use cache for freshness, not dependencies

| Question | Mechanism |
| --- | --- |
| What must be available before this runs? | `dependsOn` / plan |
| Can that value be reused without executing again? | Cache TTL |
| Must this run ignore reuse right now? | `force` |

### Let the pool coordinate concurrency

Avoid manually sequencing independent branches when the graph already expresses fan-out/fan-in. Declare edges and let waves schedule parallel work.

---

## Dependency Execution Model

```text
                    requested query
                          │
                          ▼
                 ┌──────────────────┐
                 │ Build execution  │
                 │      plan        │
                 └────────┬─────────┘
                          │
                 resolve dependencies
                          │
                          ▼
                 ┌──────────────────┐
                 │ Detect cycles    │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │  Ready nodes     │
                 │     in wave      │
                 └────────┬─────────┘
                          │
                  ┌───────┴────────┐
                  ▼                ▼
              runSelf(A)       runSelf(B)
                  │                │
                  └───────┬────────┘
                          ▼
                   next ready wave
                          │
                          ▼
                   runSelf(target)
                          │
                          ▼
                       success
                          │
                          ▼
                optional dependents
```

```text
dependsOn   →  execution graph
cache       →  freshness / reuse
force       →  execution override
dependents  →  reverse refresh cascade
in-flight   →  concurrent promise reuse
```

Together, these mechanisms coordinate asynchronous workflows without turning dependency management into application-level request bookkeeping.

---

## Next Steps

| Goal | Guide |
| --- | --- |
| Understand query state transitions | [Query Lifecycle](./lifecycle.md) |
| Configure cache reuse | [Caching](./caching.md) |
| Refresh stale queries | [Invalidation](./invalidation.md) |
| Cancel dependency execution | [Query Cancellation](./cancellation.md) |
| Create queries (`fetch` / `refresh`) | [Queries](./queries.md) |
| Coordinate writes and dependent refreshes | [Mutations](./mutations.md) |
| Run asynchronous work in workers | [Query Pool and Workers](./workers.md) |
| Overall architecture | [Query Pool Overview](./overview.md) |

The [Query Pool API Reference](../api/query-pool.md) remains the authoritative source for exact signatures and option details.
