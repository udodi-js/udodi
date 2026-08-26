# Query Cancellation

Cancellation stops in-flight asynchronous work for a query or mutation without treating the stop as an ordinary application failure.

The Query Pool uses two mechanisms together:

- **Execution identity**: each run receives a unique execution **ID**. When a run is cancelled or superseded, its **ID** becomes obsolete, so late results cannot commit state.
- **`AbortController`**: the controller for the current run is aborted so cancellable underlying work can stop.

The pool also clears its in-flight reference and updates the reactive lifecycle state. Query and mutation executions both follow this model.

Cancellation is cooperative. The underlying `source`, mutation `execute`, or worker execution can stop promptly only when it observes the supplied `AbortSignal`.

For lifecycle states, see [Query Lifecycle](./lifecycle.md). For dependency plans, shared upstream work, in-flight reuse, and `force`, see [Query Dependencies](./dependencies.md).

---

## Why Cancellation Exists

Consider a query whose first request is slow:

```text
Run A starts
    │
    │  slow
    ▼
Run B starts
    │
    ▼
Run B succeeds
    │
    ▼
new data committed


Run A finishes later
    │
    └── must not overwrite Run B
```

The Query Pool prevents the obsolete execution from committing.

Each execution captures its own **ID**. Before committing a result, the runtime checks that the **ID** is still current. If another execution has superseded it, the old result is rejected as an `AbortError` instead of updating query state. Stream chunks use the same identity check, so chunks from superseded executions are ignored.

This gives the Query Pool an important invariant:

> Only the **current** execution may commit query or mutation state.

Cancellation is therefore useful both for explicitly abandoning work and for protecting state when newer work supersedes older work.

---

## Cancel a Query

A query exposes `cancel()` directly:

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

const promise = users.fetch();

users.cancel();

console.log(users.loading); // false
console.log(users.status);  // "cancelled"
```

The cancellation itself is synchronous. The underlying `fetch()` may reject asynchronously with an `AbortError`.

### What cancel() Does

| Step | Effect |
| --- | --- |
| Supersede | Advances the execution **ID** so the current run can no longer commit |
| Abort | Calls `AbortController.abort()` |
| Clear in-flight | Removes the execution from the handle's active in-flight slot |
| Lifecycle | `loading` and `streaming` become `false`; a loading query becomes `"cancelled"` |
| Data | Existing successful data is preserved |

The implementation increments the execution **ID** before aborting the controller. This is important because it makes the previous execution obsolete immediately.

```text
┌───────────┐
│  loading  │
└─────┬─────┘
      │
      │ cancel()
      ▼
┌────────────┐
│ cancelled  │
└─────┬──────┘
      │
      ├── loading = false
      ├── streaming = false
      └── data preserved
```

Calling `cancel()` when there is no active execution does not start or create any new work.

---

## Cancellation Does Not Clear Data

Cancellation is deliberately different from resetting a query.

Suppose a query has already loaded users:

```js
await users.fetch();

console.log(users.status); // "success"
console.log(users.data);   // last successful result
```

A later refresh can then be cancelled:

```js
const request = users.refresh();

users.cancel();
```

The query does not discard its previous successful result.

Conceptually:

```text
previous success
      │
      │ data = [ ... ]
      ▼
   new run
      │
   cancel()
      │
      ▼
  cancelled
      │
      └── data = [ ... ]   ← preserved
```

This allows a UI to stop an unnecessary request while continuing to display the last known result.

---

## The Returned Promise

Cancellation does not magically turn the promise returned by `fetch()` or `refresh()` into a successful result.

For example:

```js
const request = users.fetch();

users.cancel();

try {
  await request;
} catch (error) {
  console.log(error.name); // "AbortError"
}
```

A cancelled or superseded execution rejects through the execution promise. The query handle separately exposes:

```js
users.status; // "cancelled"
```

This distinction is useful:

- the **promise** tells the caller how that particular execution settled;
- the **handle state** tells the UI the current lifecycle state.

The runtime also converts late results from superseded executions into `AbortError` so an obsolete execution cannot accidentally appear successful.

---

## Cancel a Mutation

Mutations expose the same cancellation model:

```js
const saveUser = pool.mutation("saveUser", {
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
});

const request = saveUser.mutate({ name: "Attamah" });

saveUser.cancel();

try {
  await request;
} catch (error) {
  console.log(error.name); // "AbortError"
}

console.log(saveUser.status); // "cancelled"
```

Mutation cancellation:

- advances the mutation run **ID**;
- aborts its controller;
- clears its in-flight reference;
- sets `loading` and `streaming` to `false`;
- changes `"loading"` to `"cancelled"`;
- preserves previous mutation data.

A mutation that fails normally is different. A normal failure becomes `"error"` and invokes `onError`; cancellation is represented separately as `"cancelled"`.

---

## Always Use the Signal

Cancellation is only as effective as the underlying operation's support for `AbortSignal`.

### Queries

```js
const users = pool.query("users", {
  source: async (signal) => {
    const response = await fetch("/api/users", {
      signal,
    });

    return response.json();
  },
});
```

### Mutations

```js
const saveUser = pool.mutation("saveUser", {
  execute: async (input, { signal }) => {
    const response = await fetch("/api/users", {
      method: "POST",
      body: JSON.stringify(input),
      signal,
    });

    return response.json();
  },
});
```

If the signal is ignored:

```js
source: async () => {
  return expensiveOperation();
}
```

`cancel()` still changes the Query Pool's execution state and prevents the result from being committed. However, `expensiveOperation()` itself may continue running until it finishes.

So the correct pattern is:

```text
Query Pool
    │
    │ AbortSignal
    ▼
underlying operation
    │
    ├── observes abort → stops promptly
    │
    └── ignores abort  → continues, but result cannot commit
```

The query runtime passes its controller signal directly to local `source` functions, and mutation execution receives it in the context object.

---

## Worker Cancellation

Worker-backed queries and mutations also receive the run's `AbortSignal` through the worker bridge.

For a worker query:

```js
const report = pool.query("report", {
  module: "generateReport",
});
```

Calling:

```js
report.cancel();
```

aborts the current worker execution through the Query Pool's worker infrastructure.

Worker executions also carry the current execution identity. Consequently, even if a worker result arrives after the execution has been superseded, it cannot commit to the old run.

For the worker architecture, see [Query Pool and Workers](./workers.md).

---

## cancel() vs reset()

Cancellation and reset have deliberately different purposes.

| | `cancel()` | `reset()` |
| --- | --- | --- |
| Stops in-flight work | Yes | Yes, by cancelling first |
| Preserves data | Yes | No |
| Clears cache | No | Yes, for queries |
| Clears cached input | No | Yes, for queries |
| Clears mutation variables | No | Yes, for mutations |
| Status after operation | `"cancelled"` if loading | `"idle"` |

```js
users.cancel();
// Stop work, keep the last successful result.

users.reset();
// Stop work and clear query state.
```

For queries, `reset()` clears the cache and cached input in addition to reactive state. For mutations, `reset()` clears data, variables, chunks, error, and lifecycle flags.

Use:

- **`cancel()`** when the work is no longer needed but its previous result remains useful.
- **`reset()`** when the query or mutation should return to an unused state.

---

## Cancellation vs Error

Cancellation should not normally be presented as a request failure.

| | Cancelled | Error |
| --- | --- | --- |
| Status | `"cancelled"` | `"error"` |
| Underlying cause | Abort / supersede | Operation failure |
| `error` | May reject with `AbortError`; not treated as normal query failure | Set to thrown value |
| Existing data | Preserved | Preserved |
| Query / mutation hooks | No normal error-state transition | Error state is committed (`onError` for mutations) |
| Typical UI meaning | Work was stopped | Work failed |

For queries, an abort is detected separately from an ordinary rejection. The query becomes `"cancelled"` when the current loading execution is aborted.

For mutations, cancellation similarly bypasses the normal `onError` path and commits `"cancelled"` instead.

A UI can therefore distinguish:

```js
const label = computed(() => {
  if (users.loading) return "Loading…";

  if (users.status === "cancelled") {
    return "Loading cancelled";
  }

  if (users.error) {
    return "Failed to load users";
  }

  return `Users: ${(users.data ?? []).length}`;
});
```

---

## Superseding an Execution

Cancellation does not always require calling `cancel()` explicitly.

A new execution can supersede an existing one.

### Forced query execution

```js
const first = users.fetch();

// Start a new execution and supersede the current one.
const second = users.fetch({
  force: true,
});
```

```text
Run A
  │
  │ loading
  │
  ▼
Run B starts with force
  │
  ├── Run A is cancelled/superseded
  │
  ▼
Run B becomes current
  │
  ▼
only Run B may commit
```

The `runSelf()` path cancels an existing in-flight execution when `force` is enabled. See [Query Dependencies](./dependencies.md) for how `force` interacts with plans, in-flight reuse, and cache short-circuits.

### Mutation execution

Mutations use the same single-handle model: starting another `mutate()` supersedes an existing mutation execution on that handle. The previous run is aborted and its run **ID** becomes obsolete.

This distinction is useful:

- **`cancel()`** means “stop the current work.”
- A **superseding** execution means “this newer work replaces the current work.”

---

## Cancellation and In-Flight Deduplication

Cancellation is closely related to in-flight deduplication, but they are not the same operation.

Without `force`, an existing query execution can be reused:

```js
const a = users.fetch();
const b = users.fetch();
```

Both callers can attach to the same in-flight execution.

The Query Pool stores that execution in the query's in-flight slot. A non-forced `runSelf()` returns the existing promise instead of creating another execution.

Calling:

```js
users.cancel();
```

then invalidates that execution for the handle:

```text
fetch A ───────┐
               │
fetch B ───────┼──► same in-flight execution
               │
               ▼
          users.cancel()
               │
               ▼
       execution superseded
```

Cancellation therefore stops the handle from treating that promise as its current active work.

In-flight reuse, `force`, and plan membership are covered together in [Query Dependencies](./dependencies.md).

---

## Plans and Multiple Queries

A dependency refresh may involve several query keys:

```text
 refresh("userProfile")
           │
           ▼
┌─────────────────────┐
│   execution plan    │
│                     │
│   session → user    │
│          ↓          │
│     userProfile     │
└─────────────────────┘
```

The plan executes individual query entries through their internal execution path. Independent branches can execute concurrently. Cancellation is therefore **per execution handle**, rather than a blanket assumption that every query participating in a plan has been independently cancelled.

This matters when upstream work is shared.

For example:

```text
          ┌──► profile
users ────┤
          └──► posts
```

If `users` is already in flight and is reused by another caller, cancelling one downstream operation does not imply that every caller of the shared upstream execution has stopped needing it.

Practical guidance:

- Cancel the query or mutation owned by the UI operation that is no longer needed.
- Pass `signal` into underlying asynchronous work.
- Do not assume cancelling one dependent automatically cancels every shared upstream operation.
- Let execution identity protect against late results from work that continues after supersession.

See [Query Dependencies](./dependencies.md).

---

## Streaming

Cancellation also applies to streaming executions.

For a streaming query:

```js
const report = pool.query("report", {
  module: "generateReport",
  stream: true,
});
```

The lifecycle is:

```text
loading = true
streaming = true
chunks = []
        │
        ├── chunk → chunks
        ├── chunk → chunks
        └── chunk → chunks
                │
             cancel()
                │
                ▼
       loading = false
       streaming = false
       status = "cancelled"
```

Chunks from a superseded execution are ignored because each chunk is checked against the current execution **ID** before being committed.

The same protection exists for streaming mutations.

---

## Cancellation and Optimistic Mutations

Cancellation deserves special attention when a mutation uses `onMutate()` for optimistic updates.

For example:

```js
const updateUser = pool.mutation("updateUser", {
  execute: async (input, { signal }) => {
    const response = await fetch(`/api/users/${input.id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },

  onMutate(input, ctx) {
    const previous = ctx.getQueryData("users");

    ctx.setQueryData("users", (users = []) =>
      users.map((user) =>
        user.id === input.id
          ? { ...user, ...input }
          : user,
      ),
    );

    return { previous };
  },

  onError(error, input, ctx) {
    if (ctx.previous) {
      ctx.setQueryData("users", ctx.previous);
    }
  },
});
```

Cancellation is not the same as an ordinary mutation error. The mutation runtime does **not** route an aborted execution through its normal `onError` branch; it marks the mutation as `"cancelled"`.

Therefore, if an optimistic update must also be rolled back when cancellation occurs, that policy should be designed explicitly rather than assuming `onError` will perform the rollback.

This is an important distinction:

```text
normal failure
      │
      ▼
  status = error
      │
      ▼
   onError()


cancellation
      │
      ▼
status = cancelled
      │
      └── not the normal onError path
```

See [Mutations](./mutations.md).

---

## pool.terminate()

`terminate()` is a pool-level teardown operation:

```js
pool.terminate();
```

It is intended for disposing of the Query Pool rather than routine cancellation.

When called, the pool:

- cancels registered in-flight mutations;
- terminates the worker bridge when one exists;
- releases the worker infrastructure.

Use:

```js
users.cancel();
```

for a specific query, but:

```js
pool.terminate();
```

when the entire pool is being disposed.

---

## Reactive UI

Cancellation is already represented by the query's reactive lifecycle.

You do not need a separate state variable such as:

```js
let aborted = false;
```

Instead:

```js
const label = computed(() => {
  if (users.loading) return "Loading…";

  if (users.status === "cancelled") {
    return "Cancelled";
  }

  if (users.error) {
    return "Failed";
  }

  return `Users: ${(users.data ?? []).length}`;
});
```

Because the query handle exposes reactive `loading`, `status`, `error`, and `data`, components and computed values automatically react to cancellation as part of the normal Query Pool lifecycle.

---

## Complete Example

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

async function loadUsers() {
  try {
    await users.fetch();
  } catch (error) {
    if (error?.name === "AbortError") {
      // The execution was cancelled or superseded.
      return;
    }

    console.error("Failed to load users:", error);
  }
}

loadUsers();

// Later, perhaps when leaving the view:
users.cancel();
```

The important part is not merely calling `cancel()`. The source also receives and forwards the signal:

```js
fetch("/api/users", { signal });
```

That allows cancellation to propagate all the way to the network request.

---

## Cancellation Flow

The complete query cancellation path can be viewed as:

```text
             query.cancel()
                    │
                    ▼
          advance execution ID
                    │
                    ▼
       current run becomes obsolete
                    │
                    ├───────────────┐
                    ▼               ▼
        AbortController.abort()   clear inFlight
                    │
                    ▼
             AbortSignal
                    │
                    ▼
       source / worker execution
                    │
             ┌──────┴──────┐
             │             │
          observes      ignores
            abort         abort
             │             │
             ▼             ▼
        stops work     may continue
             │             │
             └──────┬──────┘
                    ▼
            execution ID check
                    │
                    ▼
             obsolete result
              cannot commit
                    │
                    ▼
            status = cancelled
            loading = false
            streaming = false
            data preserved
```

This is the key cancellation guarantee: aborting the underlying work is cooperative, but preventing obsolete work from corrupting reactive state is enforced by the Query Pool itself.

---

## API Summary

| Surface | Role |
| --- | --- |
| `query.cancel()` | Supersede and abort the current query execution |
| `mutation.cancel()` | Supersede and abort the current mutation execution |
| `query.reset()` / `mutation.reset()` | Cancel current work and clear state |
| `signal` in `source` | Cooperative cancellation for local query work |
| `signal` in `execute` | Cooperative cancellation for local mutation work |
| Worker bridge | Propagates cancellation to module-backed execution |
| `force` | Supersedes an existing execution and starts newer work |
| Execution **ID** | Prevents late results and chunks from committing |
| `pool.terminate()` | Tear down worker infrastructure and cancel in-flight mutations |

---

## Next Steps

| Topic | Guide |
| --- | --- |
| Status and lifecycle state | [Query Lifecycle](./lifecycle.md) |
| Dependency plans, shared work, in-flight reuse, and force | [Query Dependencies](./dependencies.md) |
| Creating queries | [Queries](./queries.md) |
| Mutations and optimistic updates | [Mutations](./mutations.md) |
| Worker execution | [Query Pool and Workers](./workers.md) |
| Query Pool architecture | [Query Pool Overview](./overview.md) |

For exact signatures, see the [Query Pool API Reference](../api/query-pool.md).
