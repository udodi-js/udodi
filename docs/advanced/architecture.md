# Architecture

This page explains the high-level architecture of Udodi's runtime. It is intended for developers who already understand the public API and want to understand how components, reactivity, directives, and the internal template VM fit together.

The compiler and VM described here are **internal implementation details**. Application code should use the public APIs documented elsewhere and should not depend on internal modules or instruction formats.

## Design Goals

- Avoid a Virtual DOM and update the live DOM directly.
- Track dependencies at the value and path level so updates stay fine-grained.
- Keep templates close to HTML while using a small directive DSL for dynamic behavior.
- Compile directive expressions into VM instructions instead of evaluating arbitrary JavaScript.
- Remain compatible with strict Content Security Policy environments by avoiding `eval()` and `new Function()`.
- Keep the runtime surface small enough to reason about.
- Prefer predictable rules over maximum template expressiveness.
- Support use with or without a build step.
- Support native CSS scoping without CSS-in-JS or any build step.
- Ensure every feature works when loaded from a CDN.

## High-Level Runtime Structure

```text
┌─────────────────────────────────────┐
│          Application code           │
│─────────────────────────────────────│
│  createComponent(), render(),       │
│  reactive(), effect(), store,       │
│  query pool, overlay                │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│         Component runtime           │
│─────────────────────────────────────│
│  state, computed, methods, props,   │
│  watchers, interceptors, lifecycle, │
│  styles                             │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│           Reactive graph            │
│─────────────────────────────────────│
│  signal-backed properties, effects, │
│  computed values, touch()           │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│   Template and directive runtime    │
│─────────────────────────────────────│
│  Lexer → Parser → Compiler → VM     │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│         Directive bindings          │
│─────────────────────────────────────│
│  @text, @bind, @on, @if, @for,      │
│  @class, @style, forms, etc.        │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│              Live DOM               │
│─────────────────────────────────────│
│  targeted text, property, attribute,│
│  event, and structural updates      │
└─────────────────────────────────────┘
```

Application code defines components, reactive values, shared state, asynchronous data lifecycles, and overlays through public APIs such as `createComponent()`, `render()`, `reactive()`, `effect()`, `store`, `defineStore()`, `createQueryPool()`, and `openModal()`.

The component runtime turns a component definition into mounted component instances. Each instance receives its own state, computed values, methods, props, watchers, interceptors, lifecycle hooks, template, style scope, and runtime contexts.

The reactive graph is the shared foundation beneath components, Store, Query Pool, forms, and directive bindings. Reactive reads subscribe the active effect to the specific signal or property being read. Writes schedule only the effects that depend on that value.

The template and directive runtime connects compiled directive expressions to DOM operations. Udodi does not re-render a whole component tree for a text change. The directive effect that read the changed value runs again and updates the specific DOM target it owns.

## Template & Directive Pipeline

Udodi templates are ordinary HTML strings, usually written with the `html` tagged template helper. The browser parses the HTML into DOM nodes during mounting. Udodi then walks the DOM, finds directive attributes, and binds those directives to the component context.

Directive values use Udodi's template DSL. The DSL supports paths, literals, colon-style resolver calls, pipelines, conditional values, and directive-specific binding syntax. It does not expose arbitrary JavaScript expressions.

```text
┌─────────────────────────────────────┐
│          Directive source           │
│─────────────────────────────────────│
│  @text="user.name | capitalise"     │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│               Lexer                 │
│─────────────────────────────────────│
│  TOKEN_PATH, TOKEN_PIPE,            │
│  TOKEN_STRING, ...                  │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│              Parser                 │
│─────────────────────────────────────│
│  expression and binding AST         │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│             Compiler                │
│─────────────────────────────────────│
│  lowered VM instruction objects     │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│                VM                   │
│─────────────────────────────────────│
│  evaluate paths, calls, literals,   │
│  conditionals                       │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│          Directive binding          │
│─────────────────────────────────────│
│  apply text, class, events, etc.    │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│              Live DOM               │
└─────────────────────────────────────┘
```

The lexer converts a directive string into tokens. The parser turns those tokens into a small AST. The compiler lowers that AST into instruction objects used by the VM. The VM evaluates those instructions against the current component context.

Directive processors normalize directive values before compilation. The runtime then uses a module-level instruction cache keyed by the normalized directive string. This means a directive does not only avoid recompilation during later reactive updates; repeated uses of the same normalized directive source can reuse the same compiled instruction array elsewhere in the mounted DOM. Directive-specific normalization still matters, so reuse happens at the compiled directive-string level rather than by arbitrary expression fragments.

When reactive state changes, directive effects reuse the compiled expression or instruction data. They do not re-tokenize or re-parse the directive on each update.

This design is also why Udodi can stay CSP-friendly. Template expressions are interpreted as Udodi DSL instructions; they are not passed to `eval()`, `new Function()`, or a JavaScript expression compiler.

The VM is deliberately internal. Its current instruction shapes are useful for the runtime, but they are not part of the public API.

## Reactivity Model

Udodi's reactive system is built from signals, effects, computed values, and shallow reactive objects.

`reactive()` creates a shallow object whose own properties are backed by signals. Reading a property inside an active effect subscribes that effect to the property's signal. Writing the property notifies subscribers if the value changed according to `Object.is`.

```text
effect reads ctx.count
      │
      ▼
subscribe effect to "count"
      │
      ▼
ctx.count = 2
      │
      ▼
schedule subscribers of "count"
      │
      ▼
rerun only effects that read "count"
```

Directive bindings are effects. A `@text="count"` binding reads `count`, so it subscribes to that root property. When `count` changes, the text binding updates its element's `textContent`; other bindings that did not read `count` are not involved.

Component state follows the same shallow model. Root properties returned by `state()` are reactive. Nested plain objects are not deeply proxied automatically. When deeper updates are needed, applications can replace the root property or call `touch()` on the owning root key. Arrays, `Map`, and `Set` receive collection wrappers for structural mutations, but deep mutation inside collection items is still explicit.

Effects are scheduled through a microtask queue and deduplicated within the same flush. This keeps multiple writes from repeatedly running the same effect in the middle of a synchronous update sequence.

## Component Runtime

`createComponent()` defines a component factory. Calling that factory produces a component placeholder. During `render()` or nested component resolution, Udodi turns the placeholder into a component instance and mounts it.

```text
┌─────────────────────────────────────┐
│        Component definition         │
│─────────────────────────────────────│
│         createComponent()           │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│          Component factory          │
│─────────────────────────────────────│
│          Component(props)           │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│        Component placeholder        │
 ─────────────────────────────────────│
│    render() / nested resolution     │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│         Component instance          │
│─────────────────────────────────────│
│              mount()                │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│     Mounted DOM + cleanup scope     │
└─────────────────────────────────────┘
```

When a component instance is created, Udodi assembles:

- instance-local shallow reactive state from `state()`;
- computed values backed by `computed()`;
- methods bound to the public component context;
- watchers implemented with effects over declared dependencies;
- props, including explicit reactive prop bindings through `bindProp()`;
- interceptors for controlling state writes;
- refs and the framework-owned `ud` namespace;
- lifecycle hooks;
- scoped style registration when `style` is present;
- the template string or function-template result;
- the standard-library helpers on the internal context.

Udodi maintains two context surfaces for a mounted component:

```text
┌─────────────────────────────────────┐
│          Internal context           │
│─────────────────────────────────────│
│  used by VM, directives, bindDOM(), │
│  and template evaluation            │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│           Runtime systems           │
└─────────────────────────────────────┘



┌─────────────────────────────────────┐
│      Public context membrane        │
│─────────────────────────────────────│
│  exposed to methods, lifecycle,     │
│  watchers, computed callbacks,      │
│  function templates, and            │
│  mounted instance.context           │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│          Application code           │
└─────────────────────────────────────┘
```

The internal context is the runtime-facing surface. It contains state accessors, computed getters, methods, props, refs, framework data needed by directive evaluation, and Udodi's standard-library helpers (`trim`, `get`, `upper`, `lower`, `capitalise`, `size`, `negate`, and the `n` alias). These helpers are seeded onto every component instance so templates and pipelines can perform common transformations (for example `| capitalise` or `| trim`) without an extra import. Application code may override any of them by declaring a method or computed value of the same name.

The public context is a controlled Proxy membrane. It lets application code read and write registered state keys, read computed values and props, call methods, access refs, and register cleanup. It rejects arbitrary root-level additions and protects reserved framework names. The standard-library helpers stay on the internal context for the template runtime; they are not projected onto the public membrane.

### Component Lifecycle (Architectural View)

A component instance moves through a fixed set of stages owned by the runtime:

```text
createComponent({ ... })
        │
        ▼
Component factory
        │
        │ Component(props) / render()
        ▼
Initialize instance
  • state()
  • reactive state store
  • interceptors
  • computed values
  • methods
  • props
  • watchers
        │
        ▼
Mount
  • create template DOM  →  DOM fragment
  • require exactly one root element
  • resolve nested components
  • bind directives
  • register root
  • inject ctx.cleanup()
  • onMount(root, ctx)
        │
        ▼
Active
  • state updates
  • computed evaluation
  • watcher effects
  • DOM bindings
        │
        ▼
Unmount / removal
  • onUnmount(root, ctx)
  • dispose watcher/computed scopes
  • run mount-scope cleanups
  • dispose directive bindings/listeners
  • unregister root
  • remove DOM when explicitly requested
```

The runtime owns the reactive scopes, directive effects, DOM listeners, root registration, and the mount-scope cleanup list. Application code participates only through `onMount`, `onUnmount`, and `ctx.cleanup(fn)`. Nested components receive their own independent lifecycle boundaries.

The runtime also registers one global `MutationObserver` that watches for component roots being removed from the document. If a mounted root is detached without an explicit `unmount()` call, the observer still runs the component's cleanup so effects, listeners, and mount-scope callbacks are not left behind. For application code, explicit unmounting remains the preferred path.

Full details of the public hooks and cleanup rules live in the [Lifecycle guide](../fundamentals/lifecycle.md).

Mounting converts the component template into a DOM fragment, enforces a single root element, resolves nested component placeholders, extracts directives, binds them, registers cleanup, appends the fragment, runs `onMount`, and renders registered scoped styles. Unmounting runs component lifecycle cleanup, directive effect cleanup, watcher/computed cleanup, style and DOM cleanup boundaries, and any cleanup callbacks registered by the component.

## CSS Scoping

Udodi scopes component styles with native CSS `@scope` rather than CSS-in-JS, class hashing, or a build-time transform. The mechanism is deliberately light and reuses a single shared stylesheet.

### Registration

When `createComponent()` receives a non-empty `style` option, it calls `createScopeId()` once for that component definition. The resulting numeric identifier is shared by every instance of the component. The CSS text is then registered against that identifier:

```text
createComponent({ style: "..." })
        │
        ▼
createScopeId()
        │
        ▼
unique scopeId for this definition
        │
        ▼
registerScope(scopeId, css)
        │
        ▼
append to shared buffer:
  @scope ([ud-scope-start="N"]) to ([ud-scope-end="N"]) { ... }
```

Duplicate registrations for the same `scopeId` are ignored, so multiple instances never re-append the same rules.

### Mount-time boundary attributes

During `mount()`, Udodi establishes CSS `@scope` boundaries on the component root:

- `ud-scope-start="<scopeId>"` on the component root (the scoping root)
- `ud-scope-end="<parentBoundary>"` on the root when the component is nested inside another scoped component (this becomes the parent’s scoping limit)

The current component’s `scopeId` is then passed downward as the parent boundary for nested mounts. A child root that receives `ud-scope-end="<parentScopeId>"` closes the parent’s scope at that boundary, so parent styles do not leak into the child tree and child styles do not leak outward.

```text
Parent (scopeId = 1)
  root[ud-scope-start="1"]
    ...
    Child (scopeId = 2)
      root[ud-scope-start="2"  ud-scope-end="1"]
        ...
```

### Rendering

After the first mount that introduces new CSS, `renderStyles()` writes the accumulated buffer into a single `<style id="udodi-styles">` element in `document.head`. Subsequent mounts that do not register new scopes result in no operations. The stylesheet is therefore shared across the whole application and grows only when a previously unseen component definition is first used.

### Design consequences

- No CSS-in-JS runtime, no style objects, and no class-name hashing.
- No build step is required; the browser's native `@scope` does the isolation.
- Multiple instances of the same component share one registered rule set.
- Nested components receive correct start/end boundaries so scopes nest cleanly.
- Styles remain ordinary CSS strings, so they stay readable and toolable.

The public surface for this behaviour is the `style` option on `createComponent()` (and the `css` tagged-template helper). Everything else is an internal implementation detail.

## Supporting Systems

### Udodi Store

Udodi Store is shared application state built on the same reactive primitives. Store keys are reactive entries, so reads inside effects, computed values, or templates can subscribe to a specific key. Modules add namespacing, actions, selectors, lifecycle, and persistence organization without changing the underlying reactive model.

### Query Pool

Query Pool owns asynchronous data lifecycles. It keeps query and mutation state reactive while managing execution, caching, invalidation, dependencies, cancellation, and optional worker-backed modules. Components consume query handles like other reactive state, while the pool owns the request lifecycle and dependency graph.

### Forms

Forms are implemented through runtime directives such as `@form`, `@validate`, `@trigger`, and `@submit`. A form creates reactive controller state under the component's `ud.forms` namespace. Fields, validation, submission, cancellation, and error state are coordinated by directive bindings rather than by a separate rendering layer.

### Overlay

The Overlay system mounts layered UI through the normal component mounting path. It owns overlay root creation, stacking, backdrop behavior, Escape handling, scroll locking, focus trapping, focus restoration, and Promise resolution. The overlay content remains normal Udodi component content.

## Key Trade-offs

Udodi avoids a Virtual DOM because its reactive graph can connect state reads directly to the DOM bindings that consume them. This removes reconciliation as a default update path, but it also means directives and lifecycle cleanup must precisely own the DOM work they create.

Templates do not run arbitrary JavaScript expressions. This makes the DSL smaller, easier to parse, and compatible with strict CSP environments. The trade-off is that complex logic belongs in component methods, computed values, or normal JavaScript instead of inline template expressions.

Reactivity is shallow at the component state root. This keeps dependency tracking predictable and avoids deep proxy overhead, but nested plain-object mutation requires replacement or an explicit `touch()` call when the root property should notify dependents.

The core deliberately leaves some application concerns outside the main runtime. Routing, build tooling, advanced diagnostics, and broader ecosystem integrations are not part of the current core package unless real usage shows they belong there.

Performance decisions favor direct work over broad abstraction. Udodi caches directive compilation, updates targeted DOM nodes, batches effect execution, and keeps the component context flat for runtime access. The cost is a smaller template language and more explicit ownership boundaries.

## Related Pages

- [Performance](../performance.md)
- [Template Overview](../templates/index.md)
- [Template DSL](../templates/dsl.md)
- [Reactive State](../reactivity/state.md)
- [Effects](../reactivity/effects.md)
- [Components](../fundamentals/components.md)
- [Context](../fundamentals/context.md)
- [Component Styles](../fundamentals/styles.md)
- [Lifecycle](../fundamentals/lifecycle.md)
- [Project Structure](../project-structure.md)
