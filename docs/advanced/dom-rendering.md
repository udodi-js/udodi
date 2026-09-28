# DOM Rendering

Udodi turns a component template into a live DOM tree during mounting. After mounting, reactive effects update the specific DOM targets that depend on changed values. This page describes that rendering path, from template instantiation and directive binding to structural updates and cleanup.

The compiler, VM, and binding machinery described here are implementation details. Application code should use the public APIs rather than depend on internal instruction formats or modules.

For the broader runtime model, see [Architecture](./architecture.md).

## Design principles

- **Direct DOM updates.** Udodi does not use a Virtual DOM. Bindings update existing DOM nodes; structural directives create or remove DOM when necessary.
- **Fine-grained effects.** A directive owns its update work. An effect re-runs when a value it read changes, rather than causing a component-wide render.
- **Compile once, evaluate repeatedly.** Directive expressions are compiled into VM instructions and reused by subsequent evaluations.
- **CSP-friendly expression execution.** The template DSL is interpreted by Udodi's VM; it does not rely on `eval()` or `new Function()`.
- **Deferred structural content.** `@if` and `@for` retain templates and instantiate their content only when needed.
- **Scoped disposal.** Effects, listeners, and nested instances are cleaned up when their owning scope is destroyed.

## Rendering at a glance

The rendering system can be understood as a pipeline followed by a reactive update loop.

```text
COMPONENT SETUP
  │
  ▼
createComponent({ ... })
  │
  ▼
Component factory
  │
  │ Component(props) / render()
  ▼
Initialize instance
  • state() · reactive state store
  • interceptors · computed values
  • methods · props · watchers
  │
  ▼
MOUNT
  • template  →  DOM fragment (require exactly one root)
  • CSS scope markers
  • resolve non-structural nested child components
  • extract & bind directives (compile once, create effects)
  • register root · inject ctx.cleanup() · onMount(root, ctx)
  │
  ▼
LIVE DOM
  • active state updates · DOM bindings
  • nodes · properties · attributes · events


REACTIVE UPDATE
  │
state change / collection mutation / touch()
  │
  ▼
notify & schedule dependent effects
  │
  ▼
evaluate cached instructions & computed values
  │
  ▼
update owned DOM targets (watcher effects)


UNMOUNT / REMOVAL
  │
  ▼
Unmount
  • onUnmount(root, ctx)
  • dispose watcher & computed scopes
  • run mount-scope cleanups
  • dispose directive bindings & listeners
  • unregister root
  • remove DOM when explicitly requested

```

Mounting establishes the DOM and its bindings. Afterward, a state change does not restart the entire pipeline: it schedules only the effects that depend on the changed values. Structural effects may replace a branch or update a list; ordinary binding effects update their existing targets.

## Mounting a component

Mounting converts a component's template into a root element, prepares its live descendants, and connects it to the requested container.

```text
component instance
       │
       ▼
template string
       │
       │  createContextualFragment()
       ▼
DOM fragment
       │
       │  validate root
       ▼
single root element
       │
       ├── apply CSS scope markers, when needed
       │
       ├── resolve non-structural child placeholders
       │
       ▼
extract directives
       │
       ▼
bind live directives
       │
       ▼
append root to container
       │
       └── register mount / lifecycle work
```

The exact ordering of internal operations is an implementation detail; the important distinction is between constructing the initial DOM, binding the content that is live, and inserting the resulting root.

### One root element

A component template must produce exactly one root element. The root anchors component registration, lifecycle handling, scoped-style boundaries, and removal during unmount. A template with no root element or multiple top-level elements is rejected.

### Nested components

Nested components are represented by `<udodi-component>` placeholders. During mounting, eligible placeholders are replaced with mounted child roots.

A placeholder inside structural content is deferred. For example, a child inside an inactive `@if` branch or an uncreated `@for` item should not be mounted during the parent's initial pass. The structural runtime resolves such children when it instantiates the corresponding branch or item.

```text
Parent root
├── ordinary element
├── <udodi-component>       ──►  resolve during parent mount
└── @for template
     └── <udodi-component>  ──►  resolve when an item is created
```

This separates components that belong to the initial live tree from components whose existence depends on a later structural operation.

### Directive extraction

The runtime walks the mounted tree to collect directives for binding. Structural directives act as boundaries: the initial walk registers the structural owner but does not bind the ordinary directives inside its template as live content. Those directives are collected when the structural runtime creates an active branch or item.

This avoids binding template content that has not yet been instantiated.

## From expression to DOM update

A directive expression is normalized, compiled, and evaluated in the context of its owning component or structural scope.

```text
   @text="user.name | capitalise"
                 │
                 ▼
        normalize directive
                 │
                 ▼
         instruction cache
                 │
          ┌──────┴──────┐
          │             │
         hit           miss
          │             │
          │             ▼
          │           lexer → tokens
          │             │
          │             ▼
          │           parser → AST
          │             │
          │             ▼
          │          compiler
          │             │
          │             ▼
          │     cache instructions
          │             │
          └──────┬──────┘
                 │
                 ▼
       create reactive effect
                 │
                 ▼
       evaluate instructions
                 │
                 ▼
       write to the DOM target
```

### Instruction cache

Compilation is cached by normalized directive source. When the same source is used again, the runtime can reuse its compiled instruction list. On a reactive update, it evaluates those instructions again; it does not need to lex, parse, or compile the expression again.

The cache stores compiled instructions, not the result of an expression. Results are evaluated against the current runtime context.

### The VM

The VM interprets the instruction forms produced by the template compiler. Its main responsibilities include:

* **Expression evaluation**: resolve paths, literals, calls, pipelines, and conditional expressions against a runtime context.
* **Instruction execution**: execute instruction lists and return target/value results where a binding has multiple targets.
* **Event binding**: attach event listeners and apply supported event modifiers when handlers run.

The VM is an internal runtime facility. Nested contexts, such as those created for `@for`, use a parent-scope chain so a local name can shadow a name from an outer context without modifying that outer context.

```text
       resolve "item.name"
               │
               ▼
look for "item" in current scope
               │
      ┌────────┴────────┐
      ▼                 ▼
    found           not found
      │                 │
      ▼                 ▼
 read .name    inspect parent scope
                        │
               ┌────────┴────────┐
               ▼                 ▼
             found            no match
               │                 │
               ▼                 ▼
           read .name        undefined

```

### Directive effects

A dynamic binding generally creates an effect that:

1. Evaluates its compiled expression in the current context.
2. Applies the result to the DOM target owned by that binding.
3. Registers its disposer with the owning scope.

Because reactive dependencies are collected from the values read during evaluation, unrelated state changes do not schedule the effect. For example, an effect reading `count` need not run when only `theme` changes.

## Directive categories

Directives have different rendering responsibilities. Most update an existing element; event directives attach behavior; structural directives manage the existence of DOM subtrees.

### Property and content bindings

| Directive | Rendering responsibility |
| --- | --- |
| `@text` | Writes to `textContent`. |
| `@bind` | Synchronizes a form control with a context path. |
| `@class` | Updates class names. |
| `@style` | Updates inline styles. |
| `@attr` | Updates attributes. |
| `@show` | Toggles the element's `hidden` state without removing it. |
| `@ref` | Registers the element in `context.refs`. |

These bindings preserve the element itself and update the relevant DOM surface. In particular, `@show` controls visibility; it does not create or destroy the element or its descendants.

### Event bindings

`@on` binds an event handler. The VM evaluates the handler expression when the event fires, applying the configured modifiers as part of event handling. Listener registration is associated with the binding scope so it can be removed during cleanup.

```text
@on="click.prevent=save"
     │
     ▼
compile event binding
     │
     ▼
attach click listener
     │
     ▼
event fires
     │
     ▼
apply modifiers
     │
     ▼
evaluate handler in context
```

Modifiers can control event behavior, including preventing a default action, stopping propagation, restricting where a handler runs, and limiting repeated invocation. Exact supported modifiers are documented with the template API.

### Structural bindings

`@if`, `@elseif`, `@else`, and `@for` control whether DOM content exists. Unlike property bindings, they operate on templates and instances rather than simply changing a property on an already-live element.

#### Conditional branches

A conditional chain is managed as one structural unit. Its reactive effect evaluates the conditions in order and selects the first matching branch. When the selection changes, the previous branch is disposed and the newly selected branch is instantiated.

```text
           @if / @elseif / @else
                     │
                     ▼
        evaluate conditions in order
                     │
                     ▼
        select first matching branch
                     │
                     ▼
      is it already the active branch?
                     │
          ┌──────────┴──────────┐
          │                     │
         yes                    no
          │                     │
          ▼                     ▼
      keep the            dispose the
      current branch      previous branch
          │                     │  
          │                     ▼
          │               instantiate the
          │               selected branch
          │                     │
          │                     ▼
          │               bind directives
          │                     │
          │                     ▼
          │               insert branch DOM
          │                     │
          └──────────┬──────────┘
                     │
                     ▼
              update complete
```

Only the active branch is live. Directives and nested components inside an inactive branch are not bound or mounted until that branch is instantiated.

#### List rendering

`@for` treats its element as a template and creates an instance for each collection entry. Each instance receives a child scope containing the item and index names, with access to its parent scope.

```text
@for="item in items"
      │
      ▼
item template
      │
      ▼
for each collection entry
      │
      ▼
clone template
      │
      ▼
create item scope
{ item, index, __parent }
      │
      ▼
bind directives in clone
      │
      ▼
resolve nested components
      │
      ▼
insert item DOM
```

Reactive collection mutations can notify dependent effects. Reactivity of nested object properties follows the framework's shallow-reactivity model: after mutating a nested value in place, call `touch()` on the owning root key when necessary to notify dependents.

Structural templates also retain the component definitions needed to instantiate nested components in later clones. This is important because list items and conditional branches may be created after the initial mount pass.

## Two-way binding and shallow reactivity

`@bind` synchronizes a form control and a path in the runtime context:

* The binding effect writes the current context value to the control.
* An input or change event writes the control's value back to the context path.

For a nested path, the write operation updates the leaf and notifies the shallow reactive root as needed.

```text
              @bind="user.name"
                      │
         ┌────────────┴────────────┐
         │                         │
         ▼                         ▼
   reactive effect           input / change
         │                         │
         ▼                         ▼
   read user.name            read control value
         │                         │
         ▼                         ▼
   control.value             write user.name
                                   │
                                   ▼
                             touch root "user"
                             when nested
```

This lets a binding address a nested field without requiring deep proxies for every object. The notification behavior remains explicit and consistent with shallow reactivity.

## Scope and cleanup

Each mounted component or structural instance has an owning scope. The scope collects resources that must not outlive that instance, including:

* reactive effect disposers;
* event-listener removers;
* user-registered cleanup callbacks; and
* teardown for nested structural content.

```text
Mount scope
  ├── effect disposers
  ├── cleanup callbacks
  │     ├── event listener removers
  │     ├── user cleanup
  │     └── structural teardown
  └── CSS scope boundary
```

When an instance is unmounted, its scope is cleaned up. Udodi supports both explicit unmounting and cleanup after external DOM removal:

1. **Explicit unmount**: the handle returned by `mount()` or `render()` removes the root and runs the associated cleanup, including the applicable `onUnmount` lifecycle work.
2. **Observed detachment**: a document-level `MutationObserver` detects removed subtrees. The runtime checks registered component roots in the detached subtree and cleans up roots that are no longer connected.

```text
root removed
    │
    ├── explicit unmount — remove root and clean its scope
    │
    └── external removal
              │
              ▼
        MutationObserver
              │
              ▼
        inspect detached subtree
              │
              ▼
        find disconnected registered roots
              │
              ▼
        dispose effects and cleanups
              │
              ▼
        run applicable onUnmount work
```

Nested structural instances own their own scopes. Removing one list item or replacing one conditional branch therefore disposes that instance's resources without disposing the parent component.

## Scoped CSS boundaries

A component with scoped styles receives a scope identifier. The runtime marks its root with `ud-scope-start`. When the component is nested within another scoped component, its root also records the inherited parent boundary using `ud-scope-end`.

```text
Parent root
  ud-scope-start="parent"
  │
  └── Child root
        ud-scope-start="child"
        ud-scope-end="parent"
        │
        └── descendant elements
```

The boundary markers let the style system distinguish a component's own scope from an enclosing scope. Style registration and injection are coordinated with mounting.

## The steady-state update path

After the initial mount, ordinary reactive updates follow a compact path:

```text
state write / collection mutation / touch()
        │
        ▼
reactive dependency notified
        │
        ▼
affected effects are scheduled
(microtask, deduplicated)
        │
        ▼
effect re-runs
        │
        ▼
evaluate cached instructions
        │
        ▼
apply result to owned target
```

An ordinary binding does not trigger template recompilation, component-wide rendering, or Virtual DOM reconciliation. Its work is limited to the effects that depend on the changed values and the DOM targets those effects own. Structural effects may perform additional work when the selected branch or collection content changes.

## Summary

| Concern | Rendering model |
| --- | --- |
| Initial DOM | Template string becomes a DOM fragment and a single component root. |
| Expression processing | Directive expressions are compiled into cached VM instructions. |
| Ordinary updates | Fine-grained effects write directly to their DOM targets. |
| Events | Event bindings attach scoped listeners and evaluate handlers on dispatch. |
| Conditional content | Structural effects instantiate the selected branch and dispose the previous one when it changes. |
| Lists | `@for` creates item instances with child scopes. |
| Reactivity | Dependencies are tracked at the values read by each effect; nested in-place mutations follow shallow-reactivity rules. |
| Cleanup | Scope disposal removes effects, listeners, and nested instances. |

## Related pages

- [Architecture](./architecture.md)
- [Reactivity](../reactivity/index.md)
- [Template DSL](../templates/dsl.md)
- [Components](../fundamentals/components.md)
