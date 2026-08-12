# Reactive Collections

When an array, `Map`, or `Set` is stored on a reactive object, Udodi wraps it so **structural** mutations notify the owning property.

Deep changes inside elements or values are **not** tracked automatically. Use `touch()` or replace the element/property when those need to notify.

---

## How Wrapping Works

Assignment (or initialization) through a reactive object runs the value through a collection check:

```js
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
2. Applies the mutation to the underlying collection  
3. Calls `touch(owner, key)` so dependents of that reactive property re-run  

Wrapped collections are marked with `__udodi_reactive__` so they are not wrapped again.

---

## Structural vs Deep

| Change | Notifies owner? |
|--------|-----------------|
| `items.push(x)` / `pop` / `splice` / … | Yes |
| `tags.add(x)` / `delete` / `clear` | Yes |
| `meta.set(k, v)` / `delete` / `clear` | Yes |
| `items = nextArray` (replace property) | Yes |
| `items[0].name = "..."` | No |
| `meta.get(k).field = "..."` | No |

For deep updates:

```js
state.items[0].name = "updated";
touch(state, "items");

// or replace the element / whole collection
state.items = state.items.map((item, i) =>
  i === 0 ? { ...item, name: "updated" } : item,
);
```

---

## Arrays

### Notifying methods

| Method | Notifies |
|--------|----------|
| `push` | Yes |
| `pop` | Yes |
| `shift` | Yes |
| `unshift` | Yes |
| `splice` | Yes |
| `sort` | Yes |
| `reverse` | Yes |
| `fill` | Yes |
| `copyWithin` | Yes |

Index assignment (`items[i] = value`) is **not** intercepted by the array wrapper. Prefer mutation methods, or assign a new array / call `touch`:

```js
// Prefer
state.items.push(row);
state.items.splice(i, 1, nextRow);

// Or replace
state.items = [...state.items, row];

// Index write + explicit notify
state.items[i] = nextRow;
touch(state, "items");
```

### Example

```js
const state = reactive({ todos: [] });

effect(() => {
  console.log("count", state.todos.length);
});

state.todos.push({ title: "Write docs", done: false });
state.todos.push({ title: "Ship", done: false });

state.todos[0].done = true;
touch(state, "todos"); // deep field change
```

### When the array is replaced

```js
state.todos = state.todos.filter((t) => !t.done);
```

Replacing the property notifies through the normal reactive setter. The new array is wrapped again if needed.

---

## Maps

### Notifying methods

| Method | Notifies |
|--------|----------|
| `set` | Yes |
| `delete` | Yes |
| `clear` | Yes |

```js
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

### Deep values

```js
state.scores.set("Ada", { points: 10 });

// mutating the object inside the Map does not notify
state.scores.get("Ada").points = 11;
touch(state, "scores");

// or set a new value
state.scores.set("Ada", { points: 11 });
```

---

## Sets

### Notifying methods

| Method | Notifies |
|--------|----------|
| `add` | Yes |
| `delete` | Yes |
| `clear` | Yes |

```js
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

### Objects in Sets

Identity is by reference. Mutating an object that is already in the Set does not change Set membership and does not notify:

```js
const user = { id: 1, name: "Ada" };
state.selected.add(user);

user.name = "Grace";
touch(state, "selected"); // if dependents need to re-run
```

---

## Ownership

The wrapper notifies the **reactive property** that owns the collection (`owner` + `key` captured at wrap time):

```text
state.items  →  reactiveArray(array, state, "items")
                     │
                     └── push/pop/...  →  touch(state, "items")
```

Always mutate through the reference held on the reactive object (or a reference obtained from it). A bare array that was never assigned to reactive state is not wrapped.

```js
const orphan = [];
orphan.push(1); // not reactive

state.items = orphan; // now wrapped; future structural mutations notify
state.items.push(2);  // notifies
```

---

## Replacing vs Mutating

| Approach | Example | Notifies |
|----------|---------|----------|
| Structural mutation | `state.items.push(x)` | Yes (wrapper) |
| Property replace | `state.items = next` | Yes (setter) |
| Deep field change | `state.items[0].x = y` | Only with `touch` or replace |
| Index assignment | `state.items[i] = y` | Only with `touch` or methods/replace |

Immutable-style updates are always safe and readable:

```js
state.items = [...state.items, newItem];
state.meta = new Map(state.meta).set(key, value);
state.tags = new Set(state.tags).add(tag);
```

In-place mutation is fine when you want to avoid copying; rely on the wrapper for structural methods, and `touch` for deep edits.

---

## Interaction With Effects and Computed

```js
const state = reactive({ items: [] });

const total = computed(() =>
  state.items.reduce((sum, row) => sum + row.amount, 0),
);

effect(() => {
  console.log("total", total());
});

state.items.push({ amount: 10 }); // structural → notifies → total recomputes
```

If you only change `row.amount` in place, call `touch(state, "items")` (or replace the row) so `total` and the effect update.

---

## API Summary

Collections are not constructed with a public `reactiveArray()` API in application code. They are applied automatically when values are set on reactive state.

| Collection | Structural methods that notify |
|------------|--------------------------------|
| Array | `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin` |
| Map | `set`, `delete`, `clear` |
| Set | `add`, `delete`, `clear` |

| Related | Role |
|---------|------|
| `reactive({ ... })` | Host object; assignment wraps collections |
| `touch(proxy, key)` | Notify after deep / index mutations |
| `__udodi_reactive__` | Internal mark; do not rely on it in app code |

---

## Constraints

| Behavior | Detail |
|----------|--------|
| Structural only | Method wrappers cover listed mutations |
| No deep tracking | Element/value field changes need `touch` or replace |
| Index assignment | Not wrapped for arrays; use methods, replace, or `touch` |
| One owner key | Notifications go to the property that held the collection at wrap time |
| No double wrap | Already marked collections are left as-is |

---

## Next Steps

* [Reactive State](./state.md) — `reactive()` and shallow rules  
* [Using `touch()`](./touch.md) — nested and deep notification patterns  
* [Effects](./effects.md) — reacting to collection-driven updates  
* [Reactivity Overview](./overview.md) — how collections fit the full model  
