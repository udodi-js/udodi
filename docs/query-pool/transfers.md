# Transferable Data

Transferable transport lets the Query Pool move supported objects across its worker boundaries by transferring ownership instead of creating a structured-clone copy.

It is an opt-in transport optimization, primarily useful for large binary payloads such as multi-megabyte `ArrayBuffer` values. Ordinary objects should generally remain on the default structured-clone path.

Transfer applies to **module-backed** queries and mutations. Local `source` / `execute` functions do not cross a worker boundary, so transfer has no transport effect there.

For the worker architecture, see [Query Pool and Workers](./workers.md). For module registration, see [Query Registry](./registry.md).

---

## Structured Clone vs Transfer

The Query Pool uses structured cloning by default. Transfer is enabled explicitly with `transfer: true`.

| | Structured clone | Transfer |
| --- | --- | --- |
| Transport | Copies the value | Moves ownership |
| Sender after transport | Original remains usable | Transferable becomes detached |
| Payload cost | Requires cloning | Avoids cloning the transferred object |
| Best suited for | Normal objects and ordinary application data | Large transferable binary values |
| Opt-in | No | Yes |

### Structured clone

```text
UI Thread                         Worker
─────────                         ──────

    object
       │
       │    structured clone
       ├────────────────────────► object
       │                            │
       ▼                            ▼
original remains usable       independent copy
```

### Transfer

```text
UI Thread                         Worker
─────────                         ──────

    buffer
       │
       │   transfer ownership
       ├────────────────────────► buffer
       │                            │
       ▼                            ▼
   detached                      owns data
```

The important distinction is **copying versus ownership transfer**. Transfer does not create a second usable copy of the object on the sender.

---

## When to Use Transfer

Transfer is most useful when all of the following are true:

- the query or mutation is module-backed
- the payload is relatively large
- the value is transferable
- the application does not need the original object after the call

For example, a large binary buffer is a good candidate:

```js
const buffer = new ArrayBuffer(50 * 1024 * 1024);

await process.fetch({
  input: buffer,
  transfer: true,
});
```

A small configuration object is generally better left on structured clone:

```js
await process.fetch({
  input: {
    format: "json",
    compression: "gzip",
  },
});
```

Transfer is an optimization, not a different query execution model.

---

## Enabling Transfer

### Per execution

Query input can opt into transfer:

```js
await sorted.fetch({
  input: largeBuffer,
  transfer: true,
});
```

Mutation input can do the same:

```js
await processVideo.mutate(videoBuffer, {
  transfer: true,
});
```

Without `transfer: true`, the worker path uses structured cloning even when the supplied value happens to be transferable.

### Definition defaults

Where the API provides a transfer default, it can be used when most executions of a definition should use transferable transport.

For example, conceptually:

```js
const processVideo = pool.mutation("processVideo", {
  module: "processVideo",
  // defaults / options as supported by the API
});
```

Use a per-call option when transfer is only appropriate for particular invocations. The [Query Pool API Reference](../api/query-pool.md) is authoritative for the available definition options.

---

## What Can Be Transferred?

Common browser transferables include:

- `ArrayBuffer`
- `MessagePort`
- `ImageBitmap`
- `OffscreenCanvas`

Typed arrays and `DataView` are slightly different: the transferable object is their underlying `ArrayBuffer`, not the view itself.

For example:

```js
const buffer = new ArrayBuffer(10 * 1024 * 1024);
const view = new Uint8Array(buffer);

await sorted.fetch({
  input: view,
  transfer: true,
});
```

The relevant ownership transfer is associated with the buffer backing `view`.

Exact transferable support ultimately depends on the platform and the worker messaging path. Design module APIs around explicit transferable values when transfer performance matters.

---

## Ownership Transfer and Detachment

A successful transfer changes ownership.

```js
const buffer = new ArrayBuffer(1024 * 1024);

await sorted.fetch({
  input: buffer,
  transfer: true,
});

// `buffer` has been transferred.
// Do not treat it as a usable application buffer anymore.
```

The conceptual ownership change is:

**Before**

```text
   UI Thread
       │
       ▼
┌─────────────┐
│ ArrayBuffer │
└─────────────┘
```

**After transfer**

```text
UI Thread                         Worker
─────────                         ──────

┌─────────────┐     transfer     ┌─────────────┐
│   detached  │ ───────────────► │ ArrayBuffer │
└─────────────┘                  └─────────────┘
                                       ▲
                                       │
                                     owner
```

Therefore, after transferring a value:

- the worker receives ownership;
- the sender's transferable becomes detached;
- the sender must not rely on the original value remaining usable.

If the UI still needs the data, use one of these strategies:

### Keep a copy

```js
const workerBuffer = buffer.slice(0);

await sorted.fetch({
  input: workerBuffer,
  transfer: true,
});

// `buffer` remains available to the UI.
```

### Use structured cloning

```js
await sorted.fetch({
  input: buffer,
});
```

### Return the required data

If the worker produces data that the UI needs, have the module return the required result rather than assuming the original input remains available.

---

## Transfer Does Not Mean "Move Everything"

`transfer: true` does not mean that every object in the input graph is magically transferable.

For example:

```js
await sorted.fetch({
  input: {
    buffer,
    page: 1,
    options: {
      descending: true,
    },
  },
  transfer: true,
});
```

The worker transport must determine which transferable objects can actually be moved. Ordinary values such as strings, numbers, arrays, and plain objects still participate in structured-clone semantics.

The important application-level rule is simpler:

> Only design around post-transfer ownership for values that you know are transferable.

---

## Multiple Worker Boundaries

Udodi's worker architecture can involve multiple boundaries:

```text
UI Thread
    │
    │ transfer
    ▼
Worker Bridge
    │
    │ transfer
    ▼
Main Worker
    │
    │ transfer
    ▼
Compute Worker
```

A transferable object does not become simultaneously available to every worker.

Ownership moves from one endpoint to the next:

```text
UI
 │
 │ transfer
 ▼
Main Worker
 │
 │ transfer
 ▼
Compute Worker
```

The Query Pool owns this transport machinery. Application code specifies:

```js
await query.fetch({
  input: buffer,
  transfer: true,
});
```

It does not manually construct intermediate `postMessage()` transfer lists for each worker hop.

This is particularly important because a transferred `ArrayBuffer` is detached at each ownership handoff. The worker infrastructure must therefore perform the appropriate transfer again when the same value needs to cross another worker boundary.

---

## Transfer and Caching

Transferable input interacts with Query Pool caching in an important way.

The Query Pool's TTL cache stores successful **query results**, not reusable copies of transferred input.

```text
                Query execution
                       │
             ┌─────────┴─────────┐
             │                   │
          input               result
             │                   │
       transfer: true       TTL cache
             │                   │
             ▼                   ▼
       Worker owns it       reusable result
```

Consequently:

- the result may be cached normally;
- the transferred input is not preserved as a usable UI-side buffer;
- `refresh()` should not be treated as a mechanism for resurrecting a detached input object.

If the same input needs to be reused by a later refresh, prefer structured cloning or retain a separate copy.

```js
const buffer = new ArrayBuffer(10 * 1024 * 1024);

// Safe when the same logical input must remain reusable.
await query.fetch({
  input: buffer,
});
```

Where transfer is more important than retaining the original:

```js
const buffer = new ArrayBuffer(10 * 1024 * 1024);

await query.fetch({
  input: buffer,
  transfer: true,
});

// The buffer was intentionally handed to the worker.
```

See [Caching](./caching.md).

---

## Transfer and refresh()

This distinction is worth making explicit.

Suppose a query records input for later refresh:

```js
await sorted.fetch({
  input: buffer,
});
```

A later:

```js
await sorted.refresh();
```

can reuse the query's recorded input according to the normal refresh semantics.

With transfer:

```js
await sorted.fetch({
  input: buffer,
  transfer: true,
});
```

the original buffer has been transferred. The application must not assume that the same live buffer can subsequently be reused.

The safe rule is:

```text
Need to reuse the input?
        │
        ├── yes ──► structured clone / keep a separate copy
        │
        └── no ───► transfer is a good candidate
```

---

## setQueryData() Is Independent

Transfer only concerns transport into worker-backed execution.

It does not change how reactive query data is managed.

```js
await sorted.fetch({
  input: buffer,
  transfer: true,
});

sorted.data;
```

Likewise:

```js
pool.setQueryData("sorted", nextValue);
```

still writes reactive query data directly. No worker transfer is implied by `setQueryData()`.

This separation is intentional:

```text
Transfer
   │
   └── worker input transport


Query state
   │
   ├── data
   ├── error
   ├── loading
   ├── status
   └── cache
```

Transport does not become another state-management system.

---

## Transfer and Cancellation

Transfer does not alter Query Pool cancellation semantics.

```js
const run = sorted.fetch({
  input: largeBuffer,
  transfer: true,
});

sorted.cancel();
```

Cancellation still:

- supersedes the current execution identity;
- aborts the run's `AbortController`;
- signals the worker bridge;
- prevents late results from committing;
- updates the reactive lifecycle state.

A buffer may already have reached a worker before cancellation takes effect:

```text
transfer
   │
   ▼
worker receives buffer
   │
   │ cancel()
   ▼
worker aborts where possible
   │
   ▼
late result cannot commit
```

Cancellation therefore has two separate guarantees:

1. cooperative cancellation attempts to stop the underlying work;
2. execution identity guarantees that stale results cannot overwrite current query state.

See [Query Cancellation](./cancellation.md).

---

## Transfer and Superseding Runs

Consider two executions:

```js
const first = query.fetch({
  input: firstBuffer,
  transfer: true,
});

const second = query.fetch({
  input: secondBuffer,
  force: true,
  transfer: true,
});
```

The newer execution becomes authoritative.

```text
Run A
  │
  │ transfer
  ▼
Worker
  │
  │
  │ Run B supersedes A
  ▼
Run B ─────────────► current execution
  │
  ▼
commit result

Run A ─────────────► late result
                         │
                         ▼
                      ignored
```

Transfer does not weaken the Query Pool's protection against stale worker results.

---

## Streaming

Transfer of input and streaming of output are separate concerns.

```js
const report = pool.query("report", {
  module: "generateReport",
  stream: true,
});

await report.fetch({
  input: largeBuffer,
  transfer: true,
});
```

Here:

- `transfer: true` controls how the input reaches the worker;
- `stream: true` controls progressive output from the module;
- `report.chunks` exposes received chunks on the reactive query handle.

Conceptually:

```text
                 module execution
                       │
          ┌────────────┴────────────┐
          │                         │
        input                     output
          │                         │
       transfer                 streaming
          │                         │
          ▼                         ▼
       worker                 query.chunks
```

Input transfer does not imply that stream chunks are transferred, and streaming does not imply that input is transferred.

The transport details for individual output chunks depend on the worker bridge and platform.

See [Query Pool and Workers](./workers.md) and [Query Lifecycle](./lifecycle.md).

---

## Worker-Backed Query Example

A complete example makes the ownership model clearer:

```js
import { createQueryPool } from "udodi";

const pool = createQueryPool({
  worker: {
    enabled: true,
    computeWorkers: 2,
  },
});

pool.registerModule("processBuffer", {
  url: new URL("./workers/process-buffer.js", import.meta.url).href,
});

const processed = pool.query("processed", {
  module: "processBuffer",
});

const buffer = new ArrayBuffer(20 * 1024 * 1024);

await processed.fetch({
  input: buffer,
  transfer: true,
});

console.log(processed.data);

// `buffer` has been transferred.
// Do not reuse it on the UI thread.
```

The module receives the transferred buffer without requiring the application to manually interact with `postMessage()`.

---

## Mutation Example

Transfer works for module-backed mutations as well:

```js
const processVideo = pool.mutation("processVideo", {
  module: "processVideo",
  invalidates: ["videos"],
});

const videoBuffer = await getVideoBuffer();

await processVideo.mutate(videoBuffer, {
  transfer: true,
});
```

The mutation's optimistic lifecycle remains on the Query Pool:

```text
UI Thread

onMutate()
    │
    ├── optimistic query update
    │
    ▼
mutation execution
    │
    │ transfer input
    ▼
 Worker
    │
    ▼
 result
    │
    ▼
onSuccess()
    │
    ▼
invalidate / refresh
```

Transfer only changes how `videoBuffer` reaches the worker.

Be careful with optimistic state:

```js
onMutate(input, ctx) {
  // `input` may be transferred later.
  // Do not assume it remains a usable UI-side buffer.
}
```

If optimistic UI state needs the binary value, keep a copy before transferring it.

---

## What Transfer Does Not Apply To

Transfer is specifically a worker transport concern.

It does not provide special behavior for:

```js
pool.query("users", {
  source: async (signal) => {
    // Runs on the application thread.
  },
});
```

or:

```js
pool.mutation("saveUser", {
  execute: async (input, { signal }) => {
    // Runs on the application thread.
  },
});
```

These are local execution paths. There is no worker boundary through which the Query Pool needs to transfer the input.

The transfer option therefore matters for **module-backed** execution.

---

## When Not to Transfer

Prefer the default structured-clone path when:

- the payload is small;
- the payload is an ordinary object;
- the UI still needs the original value;
- the input will be reused by `refresh()`;
- the cost of cloning is insignificant;
- the value is not transferable.

For example:

```js
await query.fetch({
  input: {
    page: 1,
    sort: "name",
    descending: false,
  },
});
```

There is little benefit in trying to optimize such a payload with transfer.

---

## Transfer vs Copying a Large Buffer

For a large buffer, the distinction can be significant:

```js
const buffer = new ArrayBuffer(100 * 1024 * 1024);

// Copy
await query.fetch({
  input: buffer,
});
```

versus:

```js
const buffer = new ArrayBuffer(100 * 1024 * 1024);

// Transfer ownership
await query.fetch({
  input: buffer,
  transfer: true,
});
```

The second form avoids creating a structured-clone copy of the transferable buffer, at the cost of giving up the sender's ownership.

The correct choice is therefore not simply "transfer is faster." It is:

> Transfer when avoiding the copy is valuable and the application can give up ownership of the input.

---

## Design Rules

1. **Opt in** — structured clone is the default; transfer requires an explicit opt-in.
2. **Transfer large payloads** — the main benefit is avoiding expensive copies of large transferable values.
3. **Plan ownership** — after transfer, the sender must not depend on the original transferable remaining usable.
4. **Do not confuse input with cache** — TTL caching stores successful results; it does not preserve a reusable copy of transferred input.
5. **Treat refresh carefully** — if the same input must be reused, prefer structured cloning or retain a separate copy.
6. **Let the pool manage worker hops** — application code should not construct intermediate transfer lists manually.
7. **Keep transport separate from state** — transfer does not alter reactive query state, cache semantics, or lifecycle semantics.
8. **Cancellation still applies** — transferred work can be superseded and late results remain prevented from committing.
9. **Streaming is independent** — transfer controls input transport; stream controls progressive output.
10. **Use transfer deliberately** — ownership transfer is a semantic decision as well as a performance optimization.

---

## Mental Model

The simplest way to think about transferable transport is:

```text
                Query Pool
                    │
             module execution
                    │
                    ▼
             Worker Bridge
                    │
          ┌─────────┴─────────┐
          │                   │
      structured           transfer
       clone                  │
          │                   │
          ▼                   ▼
       copy made         ownership moves
          │                   │
          ▼                   ▼
     sender keeps        sender loses
       original             value
```

The Query Pool therefore gives the application a deliberate choice:

> copy the input by default, or move ownership when the payload and execution model justify it.

---

## API Summary

| Surface | Role |
| --- | --- |
| `fetch({ input, transfer: true })` | Transfer module-backed query input |
| `mutate(input, { transfer: true })` | Transfer module-backed mutation input |
| Definition transfer defaults | Configure a default transfer preference where supported |
| Structured clone | Default worker input transport |
| Transferable input | Moves ownership instead of cloning |
| Detachment | Sender loses usable access after successful transfer |
| `setQueryData()` | Reactive query-data update; independent of transport |
| `cancel()` | Cancels/supersedes execution; independent of transport |
| `stream: true` | Streams module output; independent of input transfer |

---

## Next Steps

| Topic | Guide |
| --- | --- |
| Worker architecture | [Query Pool and Workers](./workers.md) |
| Module registration | [Query Registry](./registry.md) |
| Module-backed queries | [Queries](./queries.md) |
| Module-backed mutations | [Mutations](./mutations.md) |
| Cache and refresh input | [Caching](./caching.md) |
| Cancellation and supersede | [Query Cancellation](./cancellation.md) |
| Streaming lifecycle | [Query Lifecycle](./lifecycle.md) |
| Architecture | [Query Pool Overview](./overview.md) |

For exact option types and supported transport behavior, see the [Query Pool API Reference](../api/query-pool.md).
