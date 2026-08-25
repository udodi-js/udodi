# Mutations

Mutations represent asynchronous write operations in the Query Pool. They are designed for operations that change server-side or externally owned data, such as creating, updating, or deleting records.

A mutation owns the lifecycle of the write itself:

- input variables
- execution state
- result data
- errors
- cancellation
- optional streaming
- optimistic updates
- rollback
- success and error hooks
- query invalidation

Unlike queries, mutations do not automatically execute when registered. A mutation starts when `mutate()` is called.

For asynchronous reads, see [Queries](./queries.md). For the mutation lifecycle model, see [Query Lifecycle](./lifecycle.md). For the queries affected after a successful mutation, see [Invalidation](./invalidation.md).

---

## The Mutation Model

A mutation is registered under a unique string key:

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
});
```

Registration is synchronous:

```js
const createUser = pool.mutation("createUser", {
  execute: createUserRequest,
});

console.log(createUser.status); // "idle"
```

Unlike `pool.query()`, registration does not start an execution.

The mutation remains idle until:

```js
await createUser.mutate({
  name: "Ada",
});
```

The basic lifecycle is:

```text
mutation registration
        │
        ▼
      idle
        │
        │ mutate(input)
        ▼
     loading
      /    \
     /      \
success    error
   │          │
   └────┬─────┘
        │
     next mutate()
        │
        ▼
     loading
```

`cancel()` can stop a loading mutation without discarding its previous successful data.

---

## Registering a Mutation

A mutation uses either a local `execute` function or a worker module.

### Local mutation

```js
const updateUser = pool.mutation("updateUser", {
  execute: async (input, { signal }) => {
    const res = await fetch(`/api/users/${input.id}`, {
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
});
```

The `execute` function receives:

- the input passed to `mutate()`
- an execution context containing the `AbortSignal`

```js
await updateUser.mutate({
  id: 1,
  name: "Ada",
});
```

The execution pipeline is:

```text
mutate(input)
     │
     ▼
execute(input, { signal })
     │
     ▼
  result
     │
     ▼
mutation.data
```

### Worker mutation

A mutation can instead reference a registered worker module:

```js
const pool = createQueryPool({
  worker: {
    enabled: true,
  },
});

pool.registerModule("saveUser", {
  url: new URL("./workers/save-user.js", import.meta.url).href,
});

const saveUser = pool.mutation("saveUser", {
  module: "saveUser",
});
```

Worker-backed mutations execute through the Query Pool worker architecture.

See [Query Registry](./registry.md) and [Query Pool and Workers](./workers.md).

A mutation definition uses the local `execute` path or the worker module path; they are not combined for the same mutation.

---

## Running a Mutation

Call `mutate(input)` to execute the mutation:

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
});

const user = await createUser.mutate({
  name: "Ada",
  email: "ada@example.com",
});
```

`mutate()` returns a promise for the mutation execution.

The mutation handle itself remains reactive:

```js
console.log(createUser.loading);
console.log(createUser.status);
console.log(createUser.data);
console.log(createUser.error);
```

This makes it possible to use the mutation directly from component templates, effects, or computed values without copying its lifecycle into component state.

---

## Mutation State

A mutation exposes reactive state describing its most recent execution.

| Field | Description |
| --- | --- |
| `data` | Latest successful mutation result. |
| `variables` | Input passed to the most recent `mutate()`. |
| `error` | Latest execution error, if any. |
| `loading` | `true` while a mutation is executing. |
| `status` | `idle`, `loading`, `success`, `error`, or `cancelled`. |
| `chunks` | Streamed chunks accumulated during the current run. |
| `streaming` | Whether a worker stream is currently open. |
| `streamed` | Whether a chunk has been received during the current run. |

For example:

```js
const status = computed(() => {
  if (createUser.loading) {
    return "Creating user…";
  }

  if (createUser.error) {
    return "Could not create user";
  }

  if (createUser.status === "success") {
    return "User created";
  }

  return "Ready";
});
```

Reading these fields from an effect, computed value, or template establishes a reactive dependency on the corresponding mutation state.

---

## Variables

`variables` contains the input from the most recent call to `mutate()`.

```js
const updateUser = pool.mutation("updateUser", {
  execute: async (input, { signal }) => {
    // ...
  },
});

await updateUser.mutate({
  id: 42,
  name: "Ada",
});

console.log(updateUser.variables);
// { id: 42, name: "Ada" }
```

This is useful when the UI needs to reflect the operation currently being performed:

```js
const message = computed(() => {
  if (!updateUser.loading) {
    return "";
  }

  return `Updating user ${updateUser.variables?.id}…`;
});
```

`variables` represents mutation input. It should not be confused with `data`, which represents the successful result returned by the mutation.

---

## Mutation Status

Mutations use the same lifecycle vocabulary as queries:

| Status | Meaning |
| --- | --- |
| `idle` | No mutation execution has completed yet. |
| `loading` | A mutation is currently executing. |
| `success` | The latest mutation completed successfully. |
| `error` | The latest mutation failed. |
| `cancelled` | The latest loading mutation was cancelled. |

A mutation starts in `idle`:

```js
const deleteUser = pool.mutation("deleteUser", {
  execute: deleteUserRequest,
});

console.log(deleteUser.status); // "idle"
```

Calling `mutate()` transitions it to `loading`:

```js
const promise = deleteUser.mutate({ id: 42 });

console.log(deleteUser.loading); // true
console.log(deleteUser.status); // "loading"

await promise;

console.log(deleteUser.status); // "success" or "error"
```

A subsequent `mutate()` starts another execution.

---

## Execution Context

Local mutation `execute` functions receive an execution context:

```js
execute: async (input, { signal }) => {
  // ...
}
```

The `signal` is the mutation's `AbortSignal`.

Always pass it to cancellable APIs:

```js
execute: async (input, { signal }) => {
  const response = await fetch("/api/users", {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  });

  return response.json();
}
```

This allows:

```js
mutation.cancel();
```

to propagate cancellation to the underlying request.

See [Query Cancellation](./cancellation.md) for the complete cancellation model.

---

## Optimistic Updates

Mutations can update query data before the server confirms the write.

This is useful when the expected result is known immediately and the UI should respond without waiting for the network request.

The `onMutate` hook runs before the mutation body:

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
        id: `temp-${Date.now()}`,
        ...input,
      },
    ]);

    return {
      previous,
    };
  },

  onError(error, input, ctx) {
    if (ctx.previous) {
      ctx.setQueryData("users", ctx.previous);
    }
  },

  invalidates: ["users"],
});
```

The flow is:

```text
mutate(input)
     │
     ▼
 onMutate()
     │
     ├── read previous query data
     │
     └── optimistic setQueryData()
     │
     ▼
 execute()
     │
   ┌─┴──────────┐
   │            │
success       error
   │            │
   ▼            ▼
invalidate   onError()
             rollback
```

Optimistic updates are therefore query-data updates, not a separate mutation state store.

---

## Mutation Context

Mutation hooks receive a context containing the Query Pool operations needed to coordinate related query data.

The context provides:

| Method / property | Purpose |
| --- | --- |
| `pool` | Public Query Pool API. |
| `getQueryData(key)` | Read current data for a query. |
| `setQueryData(key, value \| fn)` | Write query data without executing the query. |

For example:

```js
onMutate(input, ctx) {
  const previous = ctx.getQueryData("users");

  ctx.setQueryData("users", (users = []) => [
    ...users,
    {
      id: "temporary",
      ...input,
    },
  ]);

  return {
    previous,
  };
}
```

The value returned from `onMutate()` becomes part of the mutation context available to later hooks.

That is what makes rollback possible:

```js
onMutate(input, ctx) {
  const previous = ctx.getQueryData("users");

  ctx.setQueryData("users", optimisticUsers);

  return { previous };
},

onError(error, input, ctx) {
  ctx.setQueryData("users", ctx.previous);
},
```

The important distinction is:

```text
onMutate()
    │
    └── returns rollback information
             │
             ▼
        mutation context
             │
       ┌─────┴─────┐
       ▼           ▼
   onError()    onSuccess()
```

---

## Mutation Hooks

Mutations support lifecycle hooks around execution.

### onMutate

`onMutate(input, ctx)` runs before the mutation executes.

It is commonly used for:

- optimistic updates
- capturing previous query data
- preparing rollback information

```js
onMutate(input, ctx) {
  const previous = ctx.getQueryData("users");

  ctx.setQueryData("users", nextUsers);

  return { previous };
}
```

### onSuccess

`onSuccess(result, input, ctx)` runs after a successful mutation.

```js
onSuccess(result, input, ctx) {
  console.log("Created:", result);
}
```

It can be used for additional post-success work before invalidation processing.

### onError

`onError(error, input, ctx)` runs when the mutation fails.

```js
onError(error, input, ctx) {
  console.error("Mutation failed:", error);

  if (ctx.previous) {
    ctx.setQueryData("users", ctx.previous);
  }
}
```

A common optimistic-update pattern is therefore:

```js
const updatePost = pool.mutation("updatePost", {
  execute: updatePostRequest,

  onMutate(input, ctx) {
    const previous = ctx.getQueryData("posts");

    ctx.setQueryData("posts", posts => {
      return posts.map(post =>
        post.id === input.id
          ? { ...post, ...input }
          : post
      );
    });

    return { previous };
  },

  onError(error, input, ctx) {
    ctx.setQueryData("posts", ctx.previous);
  },

  onSuccess(result) {
    console.log("Server confirmed:", result);
  },
});
```

---

## Query Data Updates

`setQueryData()` changes query data without executing its source or worker module.

This makes it appropriate for optimistic mutations:

```js
const previous = ctx.getQueryData("users");

ctx.setQueryData("users", [
  ...previous,
  optimisticUser,
]);
```

It can also accept an updater function:

```js
ctx.setQueryData("users", users => {
  return users.map(user =>
    user.id === updatedUser.id
      ? updatedUser
      : user
  );
});
```

The update is reactive. Components consuming `users.data` therefore react to the change immediately.

```text
mutation
   │
   ▼
setQueryData()
   │
   ▼
query.data changes
   │
   ▼
reactive consumers update
```

`setQueryData()` does not execute the query's source.

If the server must be contacted, the mutation's `execute` or module performs that work.

---

## Rollback

A rollback normally consists of:

1. capturing the previous query data in `onMutate`
2. applying an optimistic value
3. restoring the previous value in `onError`

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

    ctx.setQueryData("posts", posts =>
      posts.map(post =>
        post.id === input.id
          ? { ...post, ...input }
          : post
      )
    );

    return { previous };
  },

  onError(error, input, ctx) {
    ctx.setQueryData("posts", ctx.previous);
  },

  invalidates: ["posts"],
});
```

The complete state flow is:

```text
                 mutate()
                    │
                    ▼
               onMutate()
                    │
             optimistic data
                    │
                    ▼
                 execute
                 /     \
                /       \
           success      error
              │           │
              │           ▼
              │        rollback
              │           │
              └─────┬─────┘
                    ▼
              invalidation
              (on success)
```

A successful mutation normally invalidates the affected queries so the authoritative server state can replace the optimistic value.

---

## Invalidating Queries

Mutations can declare the queries they invalidate:

```js
const createUser = pool.mutation("createUser", {
  execute: createUserRequest,

  invalidates: ["users"],
});
```

After a successful mutation, the listed query is invalidated and refreshed.

This separates two responsibilities:

```text
Mutation
   │
   ├── perform write
   │
   └── invalidates: ["users"]
                     │
                     ▼
                  users
                     │
                     ▼
                  refresh
```

For more advanced dependency graphs, an invalidation entry can specify whether dependents should also participate:

```js
invalidates: [
  {
    key: "postDetail",
    dependents: true,
    force: false,
  },
],
```

See [Invalidation](./invalidation.md) for the complete invalidation model.

---

## Invalidation Options

A mutation's `invalidates` list can contain query keys or invalidation descriptors.

Simple form:

```js
invalidates: [
  "users",
  "posts",
],
```

Descriptor form:

```js
invalidates: [
  {
    key: "users",
    dependents: true,
    force: false,
  },
],
```

The options control how the affected query graph is refreshed.

| Option | Purpose |
| --- | --- |
| `key` | Query to invalidate. |
| `dependents` | Whether reverse dependents should also be scheduled. |
| `force` | Whether the refresh should bypass reusable in-flight/fresh execution where applicable. |

For example:

```js
invalidates: [
  {
    key: "users",
    dependents: true,
    force: true,
  },
],
```

can refresh `users` and its dependent queries using a forced execution.

---

## Mutation Execution Options

`mutate()` accepts execution options:

```js
await createUser.mutate(input, {
  force: true,
});
```

The supported options include:

| Option | Purpose |
| --- | --- |
| `transfer` | Enable Transferable Object transport for worker execution. |
| `force` | Force invalidation refreshes where applicable. |
| `skipInvalidation` | Skip the mutation's configured invalidation processing. |
| `awaitInvalidations` | Wait for invalidation refreshes before the mutation promise resolves; defaults to `true`. |

These options affect the execution of that particular mutation call rather than changing the mutation definition permanently.

### Skipping Invalidation

A mutation can have configured invalidations while an individual execution skips them:

```js
const updateUser = pool.mutation("updateUser", {
  execute: updateUserRequest,
  invalidates: ["users"],
});

await updateUser.mutate(input, {
  skipInvalidation: true,
});
```

The mutation itself still executes normally. Only the configured invalidation phase is skipped.

This can be useful when the caller already knows that the affected query will be refreshed separately.

### Awaiting Invalidations

By default, mutation execution waits for its configured invalidation processing:

```js
await createUser.mutate(input);
```

`awaitInvalidations` can be disabled for callers that do not need to wait for those refreshes:

```js
await createUser.mutate(input, {
  awaitInvalidations: false,
});
```

The distinction is:

```text
mutate()
   │
   ▼
execute mutation
   │
   ▼
success
   │
   ▼
invalidate queries
   │
   ├── awaitInvalidations: true
   │        │
   │        ▼
   │   mutation promise waits
   │
   └── awaitInvalidations: false
            │
            ▼
       mutation can resolve
       without waiting
```

The invalidation work itself remains separate from the mutation's own execution lifecycle.

---

## Cancellation

A mutation can be cancelled while it is loading:

```js
const saveUser = pool.mutation("saveUser", {
  execute: async (input, { signal }) => {
    const res = await fetch("/api/users", {
      method: "POST",
      body: JSON.stringify(input),
      signal,
    });

    return res.json();
  },
});

const request = saveUser.mutate({
  name: "Ada",
});

saveUser.cancel();

await request.catch(() => {});
```

Calling `cancel()`:

- aborts the mutation's `AbortController`
- supersedes the current execution
- clears the in-flight execution
- changes status to `"cancelled"` when the mutation was loading
- preserves existing successful data

The underlying operation can only respond promptly to cancellation if it uses the provided signal.

```js
execute: async (input, { signal }) => {
  return fetch("/api/users", {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  });
}
```

See [Query Cancellation](./cancellation.md).

---

## Resetting a Mutation

`reset()` clears the mutation's execution state:

```js
createUser.reset();
```

It returns the mutation to `idle` and clears its current state.

Conceptually:

```text
          loading
             │
             │ reset()
             ▼
           idle
```

This differs from `cancel()`:

```text
cancel()
   │
   ├── stop current work
   ├── preserve previous data
   └── status → cancelled

reset()
   │
   ├── stop current work
   ├── clear mutation state
   └── status → idle
```

Use `cancel()` when the operation should stop but its existing successful result should remain available.

Use `reset()` when the mutation should return to its initial state.

---

## Streaming Mutations

Worker-backed mutations can use streaming when the module definition enables it.

```js
const generateReport = pool.mutation("generateReport", {
  module: "generateReport",
  stream: true,
});
```

During execution:

```js
console.log(generateReport.loading);
console.log(generateReport.streaming);
console.log(generateReport.streamed);
console.log(generateReport.chunks);
```

The streaming lifecycle is:

```text
mutate()
   │
   ▼
 loading = true
 streaming = true
 chunks = []
 streamed = false
   │
   ├── chunk ──► chunks
   │             streamed = true
   │
   ├── chunk ──► chunks
   │
   └── stream end
           │
           ▼
      streaming = false
           │
           ▼
      success / error
```

Streaming applies to worker-module execution. Local `execute` functions receive optional `stream` / `endStream` helpers when `stream: true` is set on the definition; the worker streaming transport is specific to module-backed mutations.

See [Query Pool and Workers](./workers.md) for worker execution details.

---

## Transferable Data

Worker-backed mutations use structured cloning by default.

For large binary inputs, Transferable Object transport can be enabled via `defaults.transfer` on the definition, or for an individual execution:

```js
await processVideo.mutate(videoBuffer, {
  transfer: true,
});
```

Transferable transport moves supported objects across the worker boundary rather than cloning them.

Typical transferable values include:

- `ArrayBuffer`
- `MessagePort`
- `ImageBitmap`
- `OffscreenCanvas`
- typed-array backing buffers
- `DataView` backing buffers

Because transferring detaches the object from the sender, transferable mutation input is not treated as reusable cached input.

See [Transferable Data](./transfers.md).

---

## Optimistic Update + Server Result

An optimistic update does not have to be identical to the eventual server result.

For example:

```js
const createPost = pool.mutation("createPost", {
  execute: createPostRequest,

  onMutate(input, ctx) {
    const previous = ctx.getQueryData("posts") ?? [];

    ctx.setQueryData("posts", [
      ...previous,
      {
        id: "temporary",
        ...input,
      },
    ]);

    return { previous };
  },

  onError(error, input, ctx) {
    ctx.setQueryData("posts", ctx.previous);
  },

  invalidates: ["posts"],
});
```

The optimistic value exists to provide immediate UI feedback.

After success, invalidation allows the query to obtain the authoritative server representation:

```text
              mutation
                 │
                 ▼
          optimistic update
                 │
                 ▼
              execute
                 │
              success
                 │
                 ▼
           invalidate posts
                 │
                 ▼
            refresh posts
                 │
                 ▼
        authoritative result
```

This pattern avoids treating optimistic state as authoritative server state.

---

## Error Handling

A failed mutation transitions to `"error"` and exposes the thrown value through `error`:

```js
try {
  await createUser.mutate(input);
} catch (error) {
  console.error(error);
}

console.log(createUser.status); // "error"
console.log(createUser.error);
```

The mutation's previous successful data is not automatically discarded.

This allows the UI to continue displaying the last successful mutation result while showing the new failure:

```js
const message = computed(() => {
  if (createUser.loading) {
    return "Saving…";
  }

  if (createUser.error) {
    return "Save failed";
  }

  return createUser.data
    ? "Saved"
    : "Ready";
});
```

An `onError` hook can additionally perform rollback or other error handling.

---

## Success Handling

`onSuccess` receives the mutation result, the input, and mutation context:

```js
const updateUser = pool.mutation("updateUser", {
  execute: updateUserRequest,

  onSuccess(result, input, ctx) {
    console.log("Server result:", result);
    console.log("Input:", input);
  },
});
```

If the mutation has configured invalidations, successful invalidation processing follows the mutation's success path.

This makes it possible to distinguish:

```text
mutation succeeds
      │
      ├── onSuccess()
      │
      └── invalidation
             │
             ▼
       affected queries
```

The mutation's own status describes the mutation; invalidated query statuses describe their own refresh executions.

---

## A Complete CRUD Example

The following example shows a typical create operation with optimistic state, rollback, and invalidation:

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
        id: `temporary-${Date.now()}`,
        ...input,
      },
    ]);

    return { previous };
  },

  onError(error, input, ctx) {
    ctx.setQueryData("users", ctx.previous);
  },

  onSuccess(user) {
    console.log("Created user:", user);
  },

  invalidates: ["users"],
});

await createUser.mutate({
  name: "Ada",
  email: "ada@example.com",
});
```

The complete operation is:

```text
mutate(input)
     │
     ▼
 onMutate()
     │
     ├── snapshot users
     └── optimistic users update
     │
     ▼
 execute(input)
     │
   ┌─┴─────────────┐
   │               │
success           error
   │               │
   ▼               ▼
onSuccess()     onError()
   │               │
   ▼               ▼
invalidate      rollback
   │
   ▼
refresh users
```

---

## Mutation vs Query

Queries and mutations both expose reactive execution state, but they have different roles.

| Concern | Query | Mutation |
| --- | --- | --- |
| Primary purpose | Read | Write |
| Starts automatically | Yes, on registration | No |
| Manual execution | `fetch()` | `mutate()` |
| Dependency graph | Yes | No query dependency graph of its own |
| Cache | Query cache | No mutation result cache |
| Invalidation | Can be invalidated | Can invalidate queries |
| Optimistic updates | — | `onMutate` + `setQueryData()` |
| Rollback | — | `onError` |
| Cancellation | Yes | Yes |
| Worker module | Yes | Yes |
| Streaming | Worker modules | Worker modules (and local helpers when `stream: true`) |

The most important distinction is:

> A query represents reusable asynchronous read state; a mutation represents an explicit asynchronous write operation.

---

## Mutation Lifecycle Summary

A mutation starts in `idle` and only begins execution when `mutate()` is called:

```text
          mutate(input)
                │
                ▼
          ┌─────────┐
          │ loading │
          └────┬────┘
               │
          ┌────┴────┐
          │         │
        success    error
          │         │
          ▼         ▼
      ┌─────────┐ ┌─────────┐
      │ success │ │  error  │
      └─────────┘ └─────────┘
          │         │
          └────┬────┘
               │
        mutate() again
               │
               ▼
          ┌─────────┐
          │ loading │
          └─────────┘

        cancel() while loading
                │
                ▼
          ┌───────────┐
          │ cancelled │
          └───────────┘

        reset() from any state
                │
                ▼
            ┌──────┐
            │ idle │
            └──────┘
```

Optimistic updates and invalidation sit around this lifecycle rather than replacing it:

```text
                 mutate()
                    │
                    ▼
                onMutate()
                    │
                    ▼
                 loading
                /       \
               /         \
          success        error
             │             │
             ▼             ▼
       onSuccess()      onError()
             │             │
             ▼             ▼
       invalidation     rollback
```

---

## Reactive UI Example

Because mutation fields are reactive, a component does not need separate state for the request lifecycle:

```js
const saveUser = pool.mutation("saveUser", {
  execute: saveUserRequest,
});

const buttonLabel = computed(() => {
  if (saveUser.loading) {
    return "Saving…";
  }

  if (saveUser.error) {
    return "Retry";
  }

  if (saveUser.status === "success") {
    return "Saved";
  }

  return "Save";
});
```

The UI can then call:

```js
await saveUser.mutate(formData);
```

without manually maintaining:

```js
let loading = false;
let error = null;
let saved = false;
```

The mutation handle is the reactive representation of the asynchronous write lifecycle.

---

## Cleanup

Mutation handles remain available after execution.

To clear their state:

```js
createUser.reset();
```

To stop an active execution:

```js
createUser.cancel();
```

At the pool level:

```js
pool.terminate();
```

terminates worker infrastructure and cancels in-flight mutations.

See [Query Pool Overview](./overview.md) for the complete pool lifecycle.

---

## Next Steps

| Goal | Guide |
| --- | --- |
| Create asynchronous reads | [Queries](./queries.md) |
| Understand mutation status and transitions | [Query Lifecycle](./lifecycle.md) |
| Perform optimistic updates | This guide |
| Roll back failed writes | This guide |
| Refresh affected queries | [Invalidation](./invalidation.md) |
| Understand dependency execution | [Query Dependencies](./dependencies.md) |
| Cancel asynchronous work | [Query Cancellation](./cancellation.md) |
| Execute mutations in workers | [Query Pool and Workers](./workers.md) |
| Transfer large binary inputs | [Transferable Data](./transfers.md) |
| Register worker modules | [Query Registry](./registry.md) |

The [Query Pool API Reference](../api/query-pool.md) is the authoritative source for exact mutation signatures, hook arguments, execution options, and return values.
