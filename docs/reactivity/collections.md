# Reactive Collections

When an array, `Map`, or `Set` is stored on a reactive object, Udodi wraps it so **structural** mutations notify the owning property.

Deep changes inside elements or values are **not** tracked automatically. Use `touch()` or replace the element/property when those need to notify.

## How Wrapping Works

Assignment (or initialization) through a reactive object runs the value through a collection check:

``` js
import { reactive, effect } from "udodi";

const state = reactive({
  items: [],
  tags: new Set(),
  meta: new Map(),
});

effect(() => {
  console.log(
    state.items.length,
    state.tags.size,
    state.meta.size,
  );
});

state.items.push({ id: 1 }); // notifies "items"
state.tags.add("ui");        // notifies "tags"
state.meta.set("v", 1);      // notifies "meta"
```

The wrapper:

1. Intercepts known mutation methods
2. Tracks direct array index and `length` assignments
3. Applies mutations to the underlying collection
4. Calls `touch(owner, key)` so dependents of that reactive property re-run

Wrapped collections are marked with `__udodi_reactive__` so they are not wrapped again.

For `Map` and `Set`, native methods and accessors are evaluated against the underlying collection so operations such as `size`, `get()`, `has()`, `entries()`, and `forEach()` work correctly through the reactive wrapper.

## Structural vs Deep

| Change | Notifies owner? |
|--------|-----------------|
| `items.push(x)` / `pop` / `splice` / ... | Yes |
| `items[0] = x`                           | Yes |
| `items.length = 0`                       | Yes |
| `tags.add(x)` / `delete` / `clear`       | Yes |
| `meta.set(k, v)` / `delete` / `clear`    | Yes |
| `items = nextArray` (replace property)   | Yes |
| `items[0].name = "..."`                  | No  |
| `meta.get(k).field = "..."`              | No  |

For deep updates:

``` js
state.items[0].name = "updated";
touch(state, "items");

// or replace the element / whole collection
state.items = state.items.map((item, i) =>
  i === 0 ? { ...item, name: "updated" } : item,
);
```

Direct array index and `length` assignments do **not** require `touch()`:

``` js
state.items[0] = nextItem;
state.items.length = 0;
```

## Arrays

### Notifying methods

| Method | Notifies |
|--------|----------|
| `push`       | Yes |
| `pop`        | Yes |
| `shift`      | Yes |
| `unshift`    | Yes |
| `splice`     | Yes |
| `sort`       | Yes |
| `reverse`    | Yes |
| `fill`       | Yes |
| `copyWithin` | Yes |

### Direct index and `length` assignments

Direct writes to array indexes are reactive:

``` js
state.items[0] = nextItem;
```

Assigning `length` is also reactive:

``` js
state.items.length = 0;
```

Both operations notify dependents of the owning root state key automatically. No explicit `touch()` is needed.

This makes direct indexed updates suitable for replacing existing items without allocating a new array:

``` js
for (let i = 0; i < state.items.length; i += 10) {
  const row = state.items[i];

  state.items[i] = {
    id: row.id,
    label: row.label + " !!!",
  };
}
```

Clearing an array can likewise use:

``` js
state.items.length = 0;
```

### Example

``` js
const state = reactive({ todos: [] });

effect(() => {
  console.log("count", state.todos.length);
});

state.todos.push({ title: "Write docs", done: false });
state.todos.push({ title: "Ship", done: false });

state.todos[0] = {
  ...state.todos[0],
  done: true,
};

state.todos.length = 0;
```

### Array contents are not deeply reactive

Objects stored inside an array are not recursively proxied:

``` js
state() {
  return {
    users: [
      { name: "Ada" },
    ],
  };
},
```

This does not automatically notify dependents:

``` js
this.users[0].name = "Grace";
```

Notify the root key explicitly:

``` js
this.users[0].name = "Grace";
touch(this, "users");
```

Or replace the item through a reactive array mutation:

``` js
this.users.splice(0, 1, {
  ...this.users[0],
  name: "Grace",
});
```

The second approach automatically notifies because `splice()` is a reactive array mutation.

### When the array is replaced

``` js
state.todos = state.todos.filter((t) => !t.done);
```

Replacing the property notifies through the normal reactive setter. The new array is wrapped again if needed.

## Maps

### Notifying methods

| Method | Notifies |
|--------|----------|
| `set`      | Yes  |
| `delete`   | Yes  |
| `clear`    | Yes  |

``` js
const state = reactive({
  scores: new Map(),
});

effect(() => {
  console.log(state.scores.get("Ada"));
});

state.scores.set("Ada", 10);
state.scores.set("Ada", 11);
state.scores.delete("Ada");
```

`Map` accessors and non-mutating methods operate against the underlying `Map`, so they can be used normally through the reactive wrapper:

``` js
state.scores.size;
state.scores.get("Ada");
state.scores.has("Ada");

for (const [name, score] of state.scores.entries()) {
  console.log(name, score);
}
```

### Deep values

``` js
state.scores.set("Ada", { points: 10 });

// mutating the object inside the Map does not notify
state.scores.get("Ada").points = 11;
touch(state, "scores");

// or set a new value
state.scores.set("Ada", { points: 11 });
```

## Sets

### Notifying methods

| Method | Notifies |
|--------|----------|
|`add`      | Yes   |
| `delete`  | Yes   |
| `clear`   | Yes   |

``` js
const state = reactive({
  selected: new Set(),
});

effect(() => {
  console.log([...state.selected]);
});

state.selected.add("a");
state.selected.add("b");
state.selected.delete("a");
state.selected.clear();
```

`Set` accessors and non-mutating methods operate against the underlying `Set`:

``` js
state.selected.size;
state.selected.has("a");

for (const value of state.selected.values()) {
  console.log(value);
}
```

### Objects in Sets

Identity is by reference. Mutating an object that is already in the Set does not change Set membership and does not notify:

``` js
const user = { id: 1, name: "Ada" };
state.selected.add(user);

user.name = "Grace";
touch(state, "selected"); // if dependents need to re-run
```

## Ownership

The wrapper notifies the **reactive property** that owns the collection (`owner` + `key` captured at wrap time):

``` text
state.items  →  reactiveArray(array, state, "items")
                     │
                     └── push/index/length  →  touch(state, "items")
```

Always mutate through the reference held on the reactive object (or a reference obtained from it). A bare array that was never assigned to reactive state is not wrapped.

``` js
const orphan = [];
orphan.push(1); // not reactive

state.items = orphan; // now wrapped; future structural mutations notify
state.items.push(2);  // notifies
state.items[0] = 3;   // notifies
state.items.length = 0; // notifies
```

## Replacing vs Mutating

| Approach | Example | Notifies |
|----------|---------|----------|
| Structural mutation | `state.items.push(x)` | Yes (wrapper) |
| Property replace |    `state.items = next` | Yes (setter) |
| Array index assignment | `state.items[i] = y` | Yes (wrapper) |
| Array `length` assignment | `state.items.length = 0` | Yes (wrapper) |
| Deep field change | `state.items[0].x = y` | Only with `touch` or replace |

Immutable-style updates are always safe and readable:

``` js
state.items = [...state.items, newItem];
state.meta = new Map(state.meta).set(key, value);
state.tags = new Set(state.tags).add(tag);
```

In-place mutation is fine when you want to avoid copying. Rely on the wrapper for structural methods, direct array index and `length` assignments, and `touch()` for deep edits.

## Interaction With Effects and Computed

``` js
const state = reactive({ items: [] });

const total = computed(() =>
  state.items.reduce((sum, row) => sum + row.amount, 0),
);

effect(() => {
  console.log("total", total());
});

state.items.push({ amount: 10 }); // structural → notifies → total recomputes
state.items[0] = { amount: 20 };  // index write → notifies → total recomputes
```

If you only change `row.amount` in place, call `touch(state, "items")`
(or replace the row) so `total` and the effect update.

## API Summary

Collections are not constructed with a public `reactiveArray()` API in application code. They are applied automatically when values are set on reactive state.

| Collection | Structural operations that notify |
|------------|-----------------------------------|
| Array      | `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`, index assignment `length` assignment |
| Map        | `set`, `delete`, `clear` |
| Set        | `add`, `delete`, `clear` |

| Related | Role |
|---------|------|
| `reactive({ ... })` | Host object; assignment wraps collections |
| `touch(proxy, key)` | Notify after deep mutations |
| `__udodi_reactive__` | Internal mark; do not rely on it in app code |

## Constraints

| Behavior | Detail |
|----------|--------|
| Structural only | Method wrappers cover listed mutations |
| Array index assignment | Direct index writes notify automatically |
| Array `length` assignment | Direct `length` writes notify automatically |
| No deep tracking | Element/value field changes need `touch` or replacement |
| One owner key | Notifications go to the property that held the collection at wrap time |
| No double wrap  | Already marked collections are left as-is |
