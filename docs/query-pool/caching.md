# Caching

Query caching allows the Query Pool to reuse successful query results for a limited period instead of re-running the query's source or worker module on every execution plan.

Caching is:

- **Optional**: a query is not cached unless `cache` is configured.
- **Per query**: each query maintains a single cached result entry.
- **TTL-based**: cache freshness is determined by the configured time-to-live.
- **In-memory**: cache entries belong to the Query Pool instance and are not persisted.
- **Separate from reactive state**: `query.data` always represents the latest committed result, regardless of whether the cached result is still fresh.
- **Separate from application state**: client-owned application state belongs in [Udodi Store](../store/README.md).
- **Separate from mutations**: mutation results are not cached by TTL.

Caching determines whether a query needs to execute. It does not replace the query lifecycle, dependency graph, or reactive state system.

For stale marking, mutation-driven refresh, execution plans, force, and in-flight reuse, see [Invalidation](./invalidation.md).

Query caching allows the Query Pool to reuse successful query results for a limited period, avoiding repeated execution of the query's `source` or worker module when the same query is executed again.

---

## Enabling Cache

Configure caching on an individual query:

```js
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
```

| Option | Type | Description |
| --- | --- | --- |
| `ttl` | number | Time-to-live in milliseconds for a successful cache entry. |

A query without `cache` has no TTL result cache:

```js
const liveMetrics = pool.query("liveMetrics", {
  source: fetchMetrics,
});
```

When `liveMetrics` executes again, the pool runs the source unless another execution mechanism, such as in-flight deduplication, prevents a new execution.

---

## What Is Cached?

A successful query execution can produce two related but distinct pieces of state:

```text
                         successful execution
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
             reactive handle               cache entry
                    │                           │
                  data                   ┌──────┼──────┐
                    │                    │      │      │
                    │                  value  time   stale
                    │                           │
                    │                          TTL
                    │
              available to UI
```

The reactive query state contains the latest committed result:

```js
users.data
```

The cache entry is an internal freshness mechanism that determines whether a future execution can reuse that result without running the source or module again.

A successful execution may therefore update both:

```text
successful run
      │
      ├──► query.data
      │
      └──► cache entry
             ├── value
             ├── stored time
             └── stale state
```

Errors and cancellations do not create a new successful cache entry.

Importantly, an error or cancellation also does not automatically erase previously successful data. That is query lifecycle behavior, not cache behavior. See [Query Lifecycle](./lifecycle.md).

---

## Freshness

A cache entry is **fresh** when all of the following are true:

1. The query has a cache entry.
2. The entry has not been explicitly invalidated.
3. The entry is still within its configured TTL.

Conceptually:

```text
                  query execution
                         │
                         ▼
                  cache configured?
                    │          │
                   no         yes
                    │          │
                    ▼          ▼
                 execute    cache entry
                               │
                               ▼
                            fresh?
                           /     \
                         yes      no
                          │        │
                          ▼        ▼
                    reuse data   execute
```

When the entry is fresh, `runSelf` can satisfy the query from the cache without calling its source or worker module.

When the entry is expired or stale, the query must execute again when the execution plan requires it.

### TTL example

```js
const users = pool.query("users", {
  source: fetchUsers,

  cache: {
    ttl: 60_000,
  },
});
```

If the query succeeds at 12:00:00:

```text
12:00:00 ─────────────── 12:01:00
    │                         │
    └────── fresh ────────────┘
                              │
                           expires
```

A plan executed during the fresh period can reuse the cached result.

After the TTL expires, the entry is no longer fresh and the next execution that requires the query runs `fetchUsers` again.

TTL expiry does **not** proactively execute the query. It only means the existing entry can no longer satisfy a future execution.

---

## Cache Hits Do Not Change the Dependency Plan

Caching operates inside query execution. It does not replace dependency scheduling.

For example:

```js
const users = pool.query("users", {
  source: fetchUsers,

  cache: {
    ttl: 60_000,
  },
});

const userCount = pool.query("userCount", {
  dependsOn: ["users"],

  source: async () => {
    return (pool.data("users") ?? []).length;
  },
});
```

Refreshing `userCount` still produces the dependency plan:

```text
refresh("userCount")
        │
        ▼
 users ──► userCount
   │         │
   │         └── execute
   │
   └── cache check
          │
        fresh?
      ┌───┴───┐
      │       │
     yes     no
      │       │
      ▼       ▼
    reuse   execute
```

The `users` node remains part of the plan even when its own work is satisfied by cache.

This distinction is important:

> Dependencies determine what must be considered and in what order. Cache determines whether an individual query actually needs to perform its work.

See [Query Dependencies](./dependencies.md).

---

## Cache Hit Example

```js
const users = pool.query("users", {
  source: async (signal) => {
    console.log("Fetching users...");

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

await users.fetch();
// Fetching users...

await users.refresh();
// Cache is fresh.
// source is not called.
```

The second execution can immediately reuse the successful result.

```js
console.log(users.status);
// "success"

console.log(users.data);
// cached successful result
```

The cache hit is therefore not a second network request. It is a successful query execution satisfied by the cached result.

---

## TTL Expiration

TTL expiration is passive.

The Query Pool does not run a timer that automatically re-fetches every query when its TTL expires.

Instead:

```text
successful execution
        │
        ▼
    cache stored
        │
        ▼
     TTL runs
        │
        ▼
   entry expires
        │
        │
        └──── no execution yet
                    │
                    ▼
             later execution
                    │
                    ▼
              cache stale
                    │
                    ▼
              source/module
```

For example:

```js
const config = pool.query("config", {
  source: fetchConfig,

  cache: {
    ttl: 300_000,
  },
});
```

After five minutes, the cached entry becomes unusable for a new execution plan. Nothing runs merely because those five minutes elapsed.

A later `fetch()`, `refresh()`, or dependency execution that requires the query will detect that the entry is no longer fresh and execute the query.

---

## invalidate() vs TTL Expiration

Both mechanisms make an existing cache entry unsuitable for normal reuse, but they serve different purposes.

| Mechanism | Meaning | Starts execution? |
| --- | --- | --- |
| TTL expiration | The cached result became too old | No |
| `query.invalidate()` | The cached result was explicitly declared stale | No |
| Mutation `invalidates` | Mark related queries stale and schedule their refresh | Yes, after successful mutation according to invalidation rules |

### TTL

TTL expresses time-based freshness:

```text
cache stored
     │
     ▼
   fresh
     │
    TTL
     │
     ▼
  expired
```

### Invalidation

Invalidation expresses knowledge that the data changed:

```js
users.invalidate();
```

This marks the cache stale but does not execute the query:

```text
invalidate()
     │
     ▼
stale = true
     │
     ├── no network request
     │
     ▼
later fetch / refresh / plan
     │
     ▼
execute query
```

This makes invalidation particularly useful after writes.

```js
const createUser = pool.mutation("createUser", {
  execute: createUserRequest,
  invalidates: ["users"],
});
```

After the mutation succeeds, the `users` query can be invalidated and refreshed rather than waiting for its TTL to expire.

See [Invalidation](./invalidation.md).

---

## force and Cache

A forced execution tells the Query Pool that a fresh cache entry should not be sufficient to satisfy the run.

For example:

```js
await users.fetch({
  force: true,
});
```

Conceptually:

```text
normal execution
      │
      ▼
 fresh cache?
   │       │
  yes      no
   │       │
 reuse    execute


forced execution
      │
      ▼
 ignore fresh-cache short-circuit
      │
      ▼
   execute
```

`force` is therefore different from invalidation:

- `invalidate()` marks the entry stale.
- `force` requests execution without relying on a fresh cache entry.

`force` also participates in the Query Pool's in-flight execution rules. See [Query Dependencies](./dependencies.md).

---

## Cache and In-Flight Deduplication

Caching and in-flight deduplication solve different problems.

### Cache

Cache prevents future executions from repeating work when a successful result is still fresh.

### In-flight deduplication

In-flight deduplication prevents concurrent executions from doing the same work at the same time.

For example:

```js
const users = pool.query("users", {
  source: fetchUsers,

  cache: {
    ttl: 60_000,
  },
});

const first = users.fetch();
const second = users.fetch();

await Promise.all([first, second]);
```

If both executions reach the query while the first is already running, the second can reuse the existing in-flight work.

```text
fetch()
  │
  ├── first execution ──► source
  │                         │
  │                         ▼
  │                      promise
  │                         ▲
  │                         │
  └── second execution ─── reuse
```

After the successful execution completes, the result can also be placed in the TTL cache.

So the two mechanisms operate at different times:

```text
                 Query execution
                       │
             ┌─────────┴─────────┐
             │                   │
        in-flight?          fresh cache?
             │                   │
            yes                 yes
             │                   │
           reuse               reuse
             │                   │
             └─────────┬─────────┘
                       │
                      no
                       │
                       ▼
                  execute work
```

See [Query Dependencies](./dependencies.md).

---

## Input and Cache Identity

The Query Pool's default cache is **per query key**.

It is not a general-purpose cache containing a separate entry for every input object.

Consider:

```js
const users = pool.query("users", {
  source: async (signal, input) => {
    const response = await fetch(
      `/api/users?page=${input.page}`,
      { signal }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },

  cache: {
    ttl: 60_000,
  },
});
```

Now:

```js
await users.fetch({
  input: { page: 1 },
});

await users.fetch({
  input: { page: 2 },
});
```

These do not create two independent cache entries such as:

```text
users
 ├── page 1 → cached result
 └── page 2 → cached result
```

Instead, the query has one result slot:

```text
users
   │
   └── cache
         │
         └── latest successful result
```

The latest successful execution replaces the cached result.

### Use distinct query keys for distinct cached resources

If independent cached entries are required, use distinct query keys:

```js
const user1 = pool.query("user:1", {
  source: (signal) => fetchUser(signal, 1),

  cache: {
    ttl: 60_000,
  },
});

const user2 = pool.query("user:2", {
  source: (signal) => fetchUser(signal, 2),

  cache: {
    ttl: 60_000,
  },
});
```

Now the pool has separate cache ownership:

```text
"user:1" ──► cache entry 1
"user:2" ──► cache entry 2
```

This is an important architectural distinction:

> The query key identifies the cache slot. Input does not create additional cache slots.

---

## Cached Input and refresh()

The query also tracks the last input associated with a successful execution path so that `refresh()` can repeat that query with the appropriate input.

For example:

```js
const posts = pool.query("posts", {
  source: async (signal, input) => {
    const response = await fetch(
      `/api/posts?page=${input.page}`,
      { signal }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },

  cache: {
    ttl: 30_000,
  },
});

await posts.fetch({
  input: { page: 2 },
});
```

A subsequent refresh uses the recorded input:

```js
await posts.refresh();
```

This input tracking is separate from the TTL result cache.

The pool is not maintaining:

```js
cache[serializedInput] = result
```

Instead, there is one query result cache plus separately tracked input for subsequent refresh behavior.

---

## Transferable Input

Transferable transport requires additional care.

When:

```js
await query.fetch({
  input: largeBuffer,
  transfer: true,
});
```

the transferable object can be moved across a worker boundary rather than cloned.

For an `ArrayBuffer`, the sender-side object becomes detached after transfer.

Therefore, transferable input should not be treated as reusable cached input:

```text
UI thread
   │
   │ transfer
   ▼
worker
   │
   ▼
buffer moved
   │
   ▼
sender's buffer detached
```

If the same input must remain available for subsequent execution, use the default structured-clone transport instead.

See [Transferable Data](./transfers.md).

---

## Cache and Reactive data

The cache is not the source of truth for what the UI currently displays.

The query handle exposes reactive data:

```js
users.data
```

That value represents the latest successful result committed to the query.

Suppose a query succeeds:

```text
data = users
cache = users
```

Then the next execution fails:

```text
data = previous users
cache = previous successful cache
error = failure
status = "error"
```

The UI can therefore continue displaying the previous successful data while also showing the error.

This does not mean that the failed execution was a cache hit.

The distinction is:

```text
query.data
    │
    └── latest committed successful value


query cache
    │
    └── whether a future execution can skip work
```

See [Query Lifecycle](./lifecycle.md).

---

## Cache and setQueryData()

`setQueryData()` updates reactive query data without executing the query:

```js
pool.setQueryData("users", nextUsers);
```

This is especially useful for optimistic mutations.

```js
const previous = pool.data("users") ?? [];

pool.setQueryData("users", [
  ...previous,
  newUser,
]);
```

`setQueryData()` should therefore be understood as a reactive data write, not as a replacement for query execution or a general-purpose cache API.

Mutations commonly combine it with invalidation:

```js
const createUser = pool.mutation("createUser", {
  execute: createUserRequest,

  onMutate(input, ctx) {
    const previous = ctx.getQueryData("users") ?? [];

    ctx.setQueryData("users", [
      ...previous,
      { id: "temp", ...input },
    ]);

    return { previous };
  },

  invalidates: ["users"],
});
```

See [Mutations](./mutations.md).

---

## Reset and Cache

`reset()` clears the query's cached state along with its reactive execution state.

```js
users.reset();
```

After reset:

```text
data       →   undefined
error      →   null
chunks     →   []
loading    →   false
streaming  →   false
streamed   →   false
status     →   "idle"
cache      →   cleared
input      →   cleared
```

The distinction between `cancel()` and `reset()` is important:

| Operation | Stops execution | Preserves data | Clears cache | Status |
| --- | --- | --- | --- | --- |
| `cancel()` | Yes | Yes | No | `cancelled` if loading |
| `reset()` | Yes | No | Yes | `idle` |

Use:

```js
users.cancel();
```

when the work should stop but the last successful result should remain available.

Use:

```js
users.reset();
```

when the query should return to an uninitialized state.

See [Query Lifecycle](./lifecycle.md).

---

## Cache Does Not Persist Across Pool Instances

Query cache belongs to the Query Pool instance:

```js
const poolA = createQueryPool();
const poolB = createQueryPool();
```

These pools do not share query cache.

```text
poolA
 └── "users"
      └── cache A


poolB
 └── "users"
      └── cache B
```

The same query key in another pool does not refer to the same cache entry.

Cache also does not survive a page reload or process restart.

If durable client-owned data is required, use Udodi Store with its persistence facilities rather than Query Pool's execution cache.

---

## Cache Is Not Persistent Storage

Query Pool caching is designed around execution freshness, not persistence.

It does not provide:

- `localStorage` persistence
- IndexedDB persistence
- cross-tab synchronization
- durable offline storage
- application-wide state ownership

Its purpose is much narrower:

```text
Should this query execute again?
             │
             ▼
       cache freshness
```

That separation keeps Query Pool focused on asynchronous work while Store handles client-owned application state.

---

## Common Caching Patterns

### Short TTL for frequently changing data

```js
const notifications = pool.query("notifications", {
  source: fetchNotifications,

  cache: {
    ttl: 15_000,
  },
});
```

A 15-second TTL reduces repeated requests while keeping the data reasonably fresh.

### Longer TTL for rarely changing configuration

```js
const featureFlags = pool.query("featureFlags", {
  source: fetchFeatureFlags,

  cache: {
    ttl: 5 * 60_000,
  },
});
```

### No cache for always-fresh data

```js
const liveMetrics = pool.query("liveMetrics", {
  source: fetchMetrics,
});
```

Every execution that reaches `runSelf` performs the actual work.

### Invalidate after a write

```js
const markRead = pool.mutation("markRead", {
  execute: markReadRequest,
  invalidates: ["notifications"],
});
```

Instead of waiting for:

```text
TTL expiration
     │
     ▼
eventual refresh
```

the successful mutation can trigger:

```text
mutation succeeds
      │
      ▼
notifications invalidated
      │
      ▼
notifications refreshed
```

This is generally the preferred pattern when the application knows a write has made previously cached data stale.

---

## Complete Example

```js
import { createQueryPool } from "udodi";

const pool = createQueryPool();

const users = pool.query("users", {
  source: async (signal, input) => {
    const page = input?.page ?? 1;

    const response = await fetch(
      `/api/users?page=${page}`,
      { signal }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },

  cache: {
    ttl: 60_000,
  },
});
```

Initial execution:

```js
await users.fetch();
// source executes
// successful result is committed
// result is cached
```

A refresh while fresh:

```js
await users.refresh();
// cache hit
// source does not execute
```

Explicit invalidation:

```js
users.invalidate();

await users.refresh();
// cache is stale
// source executes again
```

Forced execution:

```js
await users.fetch({
  force: true,
});
// fresh cache does not satisfy this run
// source executes
```

Reset:

```js
users.reset();
// data and cache are cleared
// status becomes "idle"
```

---

## Cache Decision Model

A useful way to think about Query Pool caching is:

```text
                  execution plan
                        │
                        ▼
                    runSelf()
                        │
                        ▼
                ┌───────────────┐
                │ Cache enabled │
                └───────┬───────┘
                        │
                  no ───┴─── yes
                  │            │
                  ▼            ▼
               execute       force?
                               │
                         yes ──┴── no
                          │         │
                          ▼         ▼
                        execute   fresh?
                                    │
                               yes ─┴─ no
                                │       │
                                ▼       ▼
                             reuse    execute
```

This makes the role of cache precise:

> Caching is a short-circuit inside query execution. It does not control whether the query belongs to a dependency plan, whether an execution is currently in flight, or whether the query's reactive state exists.

---

## API Summary

| Surface | Role |
| --- | --- |
| `cache: { ttl }` | Enables TTL-based result caching for a query. |
| Successful execution | Commits the result and updates the cache when caching is enabled. |
| Fresh cache entry | Allows `runSelf` to reuse the cached result without executing the source/module. |
| Expired entry | Cannot satisfy a new execution; the query executes when required by the plan. |
| `invalidate()` | Marks the cache entry stale without starting execution. |
| Mutation `invalidates` | Invalidates related queries and can schedule their refresh after a successful mutation. |
| `force` | Prevents a fresh cache entry from satisfying the requested execution. |
| `setQueryData()` | Updates reactive query data without executing the query. |
| `reset()` | Clears query state, cached input, and cache. |
| `cancel()` | Stops in-flight work without clearing the cache or previous data. |

---

## Key Distinctions

The following distinctions are central to understanding Query Pool caching:

| Concept | Purpose |
| --- | --- |
| Reactive data | Latest successful result exposed to consumers |
| TTL cache | Determines whether a future execution can reuse a successful result |
| In-flight deduplication | Prevents concurrent executions from repeating the same work |
| Invalidation | Explicitly declares cached data stale |
| `force` | Requests execution instead of relying on a fresh cache/in-flight reuse |
| `setQueryData()` | Writes reactive query data directly |
| Store | Owns shared client/application state |
| Mutation | Performs asynchronous writes and can invalidate queries |

The distinction between these mechanisms is what allows the Query Pool to remain an asynchronous execution runtime, rather than becoming a general-purpose state store.

---

## Next Steps

| Topic | Guide |
| --- | --- |
| Mark queries stale and refresh them | [Invalidation](./invalidation.md) |
| Understand execution, combine caching with dependencies plans and force | [Query Dependencies](./dependencies.md) |
| Understand status and data preservation | [Query Lifecycle](./lifecycle.md) |
| Perform writes that invalidate queries | [Mutations](./mutations.md) |
| Create and execute queries | [Queries](./queries.md) |
| Understand the overall architecture | [Query Pool Overview](./overview.md) |
| Transfer large values through workers | [Transferable Data](./transfers.md) |

For exact types, signatures, and option details, see the [Query Pool API Reference](../api/query-pool.md).
