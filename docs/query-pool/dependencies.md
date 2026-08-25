# Query Dependencies

Query dependencies let a Query Pool express relationships between asynchronous operations. A query can declare that it depends on one or more other queries, causing the pool to execute those upstream queries before the dependent query.

Dependencies form a directed acyclic graph (DAG). The Query Pool builds an execution plan for the requested query, executes independent branches in parallel, reuses in-flight work when possible, and can optionally refresh reverse dependents after a successful execution.

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

For the broader Query Pool model, see [Query Pool Overview](./overview.md). For execution order and in-flight reuse, see [Query Scheduling](./scheduling.md).

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

The dependency is expressed by query key, not by passing one query handle directly into another definition.

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
dashboard ───┤                  ├──► dashboard
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

Requesting `permissions` causes the pool to build the complete execution plan:

```text
permissions
     │
     ▼
  profile
     │
     ▼
  session
```

The execution itself occurs upstream-first:

```text
session
   │
   ▼
profile
   │
   ▼
permissions
```

The application therefore does not need to manually fetch each level.

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

The pool uses a depth-first traversal to resolve the dependency graph and rejects cyclic dependencies.

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

### Longer Cycles

Cycles can also occur across several queries:

```text
A → B → C → D
    ▲       │
    └───────┘
```

The number of nodes does not matter. Any dependency path that eventually points back to a query already being resolved forms a cycle.

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

## Dependency-Aware Execution

There are several ways to initiate dependency execution.

### refresh()

Calling:

```js
await dashboard.refresh();
```

runs the dependency execution plan for `dashboard`.

Likewise:

```js
await pool.refresh("dashboard");
```

starts the plan using the query key.

For:

```text
session ──► profile ──► dashboard
```

refreshing `dashboard` causes the upstream dependency chain to be considered before `dashboard` itself runs.

See [Query Scheduling](./scheduling.md) for the details of execution reuse and forcing.

### fetch({ dependencies: true })

A query can also explicitly request dependency execution when using `fetch()`:

```js
await dashboard.fetch({
  dependencies: true,
});
```

This tells the pool to execute the dependency plan rather than treating the fetch as an isolated self-execution.

This is useful when a query normally executes independently but a particular operation requires its upstream graph to be refreshed or evaluated.

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

A dependency node is executed through its internal self-run path rather than recursively calling its public `refresh()` method.

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
   │
   ▼
...
```

the dependency graph could recursively rebuild itself.

Instead, the pool builds one execution plan and executes its nodes directly:

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

---

## In-Flight Dependency Reuse

Dependencies also participate in in-flight deduplication.

Suppose `users` is already loading:

```js
const promise = users.fetch();
```

and another operation requests a plan that requires `users`:

```js
await userCount.refresh();
```

The pool can reuse the existing in-flight execution instead of starting another request.

Conceptually:

```text
                 users
                   │
             already running
                   │
                   ▼
             existing promise
                   │
             ┌─────┴─────┐
             │           │
          caller 1     caller 2
             │           │
             └─────┬─────┘
                   ▼
             same execution
```

This prevents duplicate work when multiple parts of an application request the same query at approximately the same time.

A forced execution can bypass this reuse when appropriate.

---

## force

A dependency plan normally reuses suitable in-flight work.

A forced execution can request a new run:

```js
await dashboard.refresh({
  force: true,
});
```

The exact force behavior is part of the Query Pool scheduling model: force prevents reuse of an existing in-flight execution for the affected run.

This is useful when an application explicitly requires a fresh execution rather than waiting for work that is already in progress.

See [Query Scheduling](./scheduling.md).

---

## Dependency Failures

A dependency can fail before the dependent query executes.

Consider:

```text
users
  │
  ✕ error
  │
  ▼
userCount
```

`userCount` cannot meaningfully execute if its required upstream query failed.

The Query Pool represents dependency failures with `QueryDependencyError` for affected upstream/dependent plan nodes.

This preserves an important distinction between:

- the original error produced by the query that actually failed, and
- the dependency error observed by a query that could not proceed.

For example:

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

The underlying failure is still:

```js
Error("Users API unavailable")
```

rather than being replaced by an unrelated generic error from the dependent query.

This is particularly important for preserving the root cause of cancellation and other execution failures.

### Dependent Queries Do Not Execute After a Failed Upstream Node

For:

```text
  A
  │
  ▼
  B
  │
  ▼
  C
```

if `A` fails:

```text
  A ──✕
  │
  ╳
  B


  C
```

`B` cannot proceed as a successful dependency execution, and consequently `C` cannot rely on `B`.

The dependent query's previous successful data, if any, is not automatically destroyed merely because its dependency failed. Query lifecycle state and existing data remain governed by the individual query's lifecycle rules.

See [Query Lifecycle](./lifecycle.md).

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

This is preferable to passing query handles through application state because the dependency itself is already represented by the graph:

```text
users
  │
  │ data
  ▼
userCount
```

The dependent query should nevertheless tolerate the expected shape of its upstream data. Dependency ordering guarantees execution order; it does not change the value returned by the upstream query.

---

## Multiple-Level Example

A more realistic graph might look like:

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

The graph is:

```text
               session
              /       \
             ▼         ▼
         profile    permissions
             \         /
              ▼       ▼
              dashboard
```

The execution proceeds as:

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

Only the branches that have no unresolved dependency can run at each stage.

---

## Reverse Dependents

Dependencies normally describe the upstream relationship:

```text
users ──► userCount
```

The pool can also use the reverse relationship when a query succeeds and dependent refresh is requested.

For example:

```js
await users.refresh({
  dependents: true,
});
```

Conceptually:

```text
users
  │
  ├──► userCount
  │
  └──► userPosts
```

A successful refresh of `users` can schedule its reverse dependents:

```text
users
  │
  ├──► userCount
  │
  └──► userPosts
```

This is useful when upstream data changes and derived queries need to be refreshed.

The `dependents` option is intentionally separate from `dependsOn`:

- `dependsOn` declares what this query requires.
- `dependents` controls whether queries that require this query should be scheduled.

---

## Dependencies and Mutations

Mutations commonly invalidate queries that appear upstream in a dependency graph.

For example:

```text
users
  │
  ├──► userCount
  │
  └──► userPosts
```

A mutation can invalidate `users`:

```js
const createUser = pool.mutation("createUser", {
  execute: createUserRequest,

  invalidates: ["users"],
});
```

After successful mutation execution, the pool invalidates the specified query and performs the configured refresh behavior.

A mutation can also request dependent propagation:

```js
const updateUser = pool.mutation("updateUser", {
  execute: updateUserRequest,

  invalidates: [
    {
      key: "users",
      dependents: true,
    },
  ],
});
```

This allows the dependency graph to propagate freshness changes through related queries.

See [Invalidation](./invalidation.md) for the complete invalidation model.

---

## Dependencies and Cache

Dependencies do not imply that every upstream query must perform a network request.

If an upstream query has a fresh cache entry:

```js
const users = pool.query("users", {
  source: loadUsers,

  cache: {
    ttl: 60_000,
  },
});
```

a dependency plan can satisfy `users` from its fresh cache.

Conceptually:

```text
execute dashboard
       │
       ▼
     users
       │
       ▼
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

Thus, dependency execution and cache policy remain separate concerns.

The graph determines what must be available; caching determines whether that availability requires new execution.

See [Caching](./caching.md).

---

## Dependencies and Cancellation

A dependency plan can also be cancelled.

For example:

```js
const request = dashboard.refresh();

dashboard.cancel();

await request;
```

Cancellation supersedes the relevant in-flight execution and propagates through the execution machinery without treating cancellation as an ordinary application error.

This distinction matters because an aborted dependency should not be confused with a server failure.

See [Query Cancellation](./cancellation.md).

---

## Registering Dependencies Safely

Dependencies reference query keys, so the dependency graph should use stable, unique names:

```js
const users = pool.query("users", {
  source: loadUsers,
});

const userCount = pool.query("userCount", {
  dependsOn: ["users"],
  source: computeUserCount,
});
```

Avoid generating keys dynamically unless the generated key is intentionally part of the application's query identity.

The query key identifies the query throughout:

- dependency resolution
- cache lookup
- invalidation
- `pool.get()`
- `pool.data()`
- mutation invalidation
- dependent scheduling

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

One upstream query can support several independent consumers.

### Fan-In

```text
profile ──────┐
              ├──► dashboard
permissions ──┘
```

Several independent queries can converge into a single dependent query.

### Multi-Level Fan-Out/Fan-In

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

The Query Pool's execution planner handles these relationships rather than requiring each component to manually orchestrate them.

---

## What Dependencies Do Not Do

Dependencies define execution relationships. They do not automatically:

- merge query data
- transform upstream results
- copy data into another query
- create application state
- replace caching
- make unrelated queries reactive to one another

For example:

```js
const userCount = pool.query("userCount", {
  dependsOn: ["users"],

  source: () => {
    return (pool.data("users") ?? []).length;
  },
});
```

`dependsOn` establishes:

```text
users → userCount
```

The `source` function still determines what `userCount.data` actually becomes.

---

## Dependency Graph vs State Graph

It is useful to distinguish the execution graph from the reactive state graph.

The dependency graph:

```text
users ──► userCount
```

means:

> `userCount` requires `users` to be executed or satisfied before its own execution.

The reactive relationship:

```text
users.data ──► consumer
```

means:

> a reactive consumer has read `users.data` and will respond when that value changes.

These are related but independent mechanisms.

A dependency does not require a component to read the upstream query directly, and reading query data does not automatically create a `dependsOn` relationship.

---

## Best Practices

### Keep dependencies about execution

Good:

```js
const profile = pool.query("profile", {
  dependsOn: ["session"],
  source: loadProfileFromSession,
});
```

The dependency expresses a real prerequisite.

### Avoid artificial dependencies

Do not add:

```js
dependsOn: ["users"]
```

merely because two queries happen to be used by the same component.

A dependency should represent an actual execution requirement.

### Keep graphs directed and acyclic

Prefer:

```text
A → B → C
```

over trying to make queries mutually dependent.

### Use cache for freshness, not dependencies

A dependency answers:

> What must be available before this query runs?

Cache answers:

> Can that value be reused without executing again?

They solve different problems.

### Let the pool coordinate concurrency

Avoid manually sequencing independent branches:

```js
await a.fetch();
await b.fetch();
await c.fetch();
```

when the real relationship is:

```text
      ┌──► A ──┐
root ─┤        ├──► D
      └──► B ──┘
```

Declare the graph and allow the execution planner to schedule independent branches together.

---

## Dependency Execution Model

The complete model can be summarized as:

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
          ┌────────┴───────┐
          ▼                ▼
      runSelf(A)       runSelf(B)
          │                │
          └────────┬───────┘
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

The key separation is:

```text
  dependsOn
      │
      ▼
  execution graph


    cache
      │
      ▼
  freshness / reuse


    force
      │
      ▼
  execution override


  dependents
      │
      ▼
  reverse refresh cascade
```

Together, these mechanisms allow the Query Pool to coordinate complex asynchronous workflows without turning dependency management into application-level request bookkeeping.

---

## Next Steps

| Goal | Guide |
| --- | --- |
| Understand query execution order | [Query Scheduling](./scheduling.md) |
| Understand query state transitions | [Query Lifecycle](./lifecycle.md) |
| Configure cache reuse | [Caching](./caching.md) |
| Refresh stale queries | [Invalidation](./invalidation.md) |
| Cancel dependency execution | [Query Cancellation](./cancellation.md) |
| Create queries | [Queries](./queries.md) |
| Coordinate writes and dependent refreshes | [Mutations](./mutations.md) |
| Run asynchronous work in workers | [Query Pool and Workers](./workers.md) |

The [Query Pool API Reference](../api/query-pool.md) remains the authoritative source for exact signatures and option details.
