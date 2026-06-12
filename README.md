# Udodi.js

A lightweight reactive UI runtime built around declarative HTML directives, path-level reactivity, and component-first architecture.

Udodi.js lets you build interactive interfaces using clean HTML-like directives without virtual DOM overhead, JSX, or heavy compilation pipelines.

It combines:

- reactive component state
- directive-driven rendering
- shared reactive stores
- query caching
- overlays/modals
- lifecycle cleanup
- shallow high-performance reactivity

into a compact runtime that works both with and without a build step.

```html
<div @style="background-color:cardBg color:getTextColor:mode">
  <h1 @text="title"></h1>

  <input
    @bind="user.name"
    @validate="required min:3"
    @error="nameError"
  >

  <h3 @text="nameError"></h3>

  <button @on="click.prevent:submit">
    Save Changes
  </button>
</div>
```

---

## Why Udodi?

Udodi is designed for developers who want:

- direct DOM rendering
- predictable reactivity
- minimal abstraction cost
- no virtual DOM diffing
- HTML-first UI composition
- framework-like ergonomics without framework-scale complexity

---

Unlike JSX-centric frameworks, Udodi keeps templates close to native HTML while still providing a modern reactive architecture.

## Features

- **Lightweight Runtime** — Tiny footprint with zero runtime dependencies and minimal abstraction overhead
- **Fine-Grained Reactivity** — Path-level reactive updates without virtual DOM diffing or full component re-renders
- **Directive-Driven UI** — Declarative HTML-first syntax using directives like @bind, @for, @if, @on, @style, and @class
- **Modern Reactive Primitives** — Supports reactive state, computed values, watchers, signals, resolvers, and batched updates
- **Direct DOM Rendering** — Updates the real DOM efficiently without JSX compilation or hydration complexity
- **Built-In State Ecosystem** — Includes global stores, store modules, actions, subscriptions, and reactive query stores
- **Async Query System** — Built-in caching, retries, invalidation, deduplication, scheduler integration, and AbortController support
- **Overlay & Modal Runtime** — Stack-aware modal system with focus restoration, scroll locking, teleporting, and backdrop management
- **Predictable Architecture** — Shallow reactivity and constrained directive expressions keep runtime behavior explicit and optimized
- **Modern & Performant** — Built with ES2020+, tree-shakeable ESM output, and optimized for modern browsers
- **Framework Agnostic** — Works as a simple browser script or integrates cleanly with bundlers and existing stacks
- **Easy to Learn** — Familiar mental model for developers coming from Alpine.js, Vue, Angular, or template-driven frameworks
- **No JSX Required** — Keep templates close to native HTML without introducing custom syntax layers
- **Lifecycle & Cleanup Aware** — Automatic cleanup for effects, watchers, listeners, overlays, and component unmounting
- **Component-Oriented Design** — Supports nested components, reactive props, lifecycle hooks, and isolated rendering contexts
- **CSP-Friendly Direction** — Avoids reliance on heavyweight runtime evaluation patterns common in many UI frameworks

## Directive-Based Templates

Built-in directives include:

- `@text`
- `@bind`
- `@on`
- `@for`
- `@if`
- `@show`
- `@class`
- `@style`
- `@attr`
- `@validate`
- `@ref`
- `@teleport`

## Shared State System

- Global reactive store
- Store modules
- Batched updates
- Actions
- Store subscriptions
- DevTools hooks

## Query Stores

Built-in async query system with:

- caching
- retries
- invalidation
- deduplication
- scheduler integration
- AbortController support

## Overlay & Modal Runtime

- Stack-aware modal system
- Shared overlay root
- Focus restoration
- Scroll locking
- Backdrop handling
- Teleport support

## Modern Runtime Architecture

- ESM + IIFE builds
- Tree-shakeable
- Zero dependencies
- Tiny runtime footprint
- CSP-friendly architecture
- Works with or without bundlers

## Installation

### CDN (Recommended for quick prototyping)

```html
<script src="https://cdn.jsdelivr.net/npm/udodi@latest/dist/udodi.iife.min.js"></script>
```

Then use globally:

```js
const { render, createComponent, store, openModal } = Udodi;
```

### Package Manager

```bash
npm install udodi
# or
yarn add udodi
# or
pnpm add udodi
```

```js
import { mount } from 'udodi';
```

## Quick Start

### 1. Create a Component

```js
import { createComponent } from "udodi";

export const Counter = createComponent({
  name: "counter",

  state: {
    count: 0
  },

  computed: {
    doubled(ctx) {
      return ctx.count * 2;
    }
  },

  handlers: {
    increment(ctx) {
      ctx.count++;
    }
  },

  template: () => /*html*/`
    <section class="card">
      <h1>Counter</h1>

      <p>
        Count:
        <span @text="count"></span>
      </p>

      <p>
        Doubled:
        <span @text="doubled"></span>
      </p>

      <button @on="click:increment">
        Increment
      </button>
    </section>
  `
});
```

### 2. Mount the Component

```js
import { render } from "udodi";
import { Counter } from "./Counter.js";

render(
  Counter(),
  document.getElementById("app")
);
```

## Architecture Notes

Udodi intentionally avoids several heavyweight patterns common in modern UI frameworks.

### No Virtual DOM

Udodi updates the DOM directly through reactive bindings.

### No JSX Requirement

Templates remain HTML-oriented and framework-independent.

### No Deep Proxying

Reactivity is shallow and path-based by design.

### No Arbitrary JS Expressions in Templates

Directive expressions are intentionally constrained to:

- paths
- resolver calls
- literals

This keeps:

- parsing predictable
- runtime safer
- templates easier to optimize

---

## Documentation

The README only covers the essentials.

For full documentation, architecture details, advanced APIs, and runtime behavior, see:

- [User Guide](./docs/user-guide.md)
- [Directive Reference](./docs/directives.md)
- [Reactivity System](./docs/reactivity.md)
- [Component API](./docs/components.md)

## Development

### Project Structure

```bash
udodi/
├── dist/              # Built library (ESM + IIFE)
├── docs/              # Documentation
├── packages/          # Source code
├── playground/        # Live testing environment
├── tests/             # Unit and integration tests
├── tsup.config.js     # Build configuration
└── package.json
```

### Scripts

```bash
# Build the library
npm run build

# Start development playground
cd playground
npm install
npm run dev

# Testing
npm test               # Run all tests once
npm run test:watch     # Run tests in watch mode (recommended during development)
npm run test:ui        # Open interactive browser UI for tests
```

Udodi is bundled using **[tsup](https://tsup.egoist.dev/)** and outputs:

- ESM modules
- browser IIFE builds (`window.Udodi`)

---

## Testing

Udodi is designed to support both low-level runtime testing and high-level browser integration testing.

The recommended testing strategy is:

| Test Type | Purpose |
|---|---|
| Unit Tests | Verify isolated runtime behavior |
| DOM Tests | Validate directive behavior and DOM updates |
| Integration Tests | Verify component interaction and lifecycle behavior |
| Browser Playground Tests | Validate real browser runtime behavior |
| Performance Tests | Benchmark reactivity and rendering speed |

---

### Test Structure

All tests are located in the `tests/` directory:

```bash
tests/
├── directives/
│   ├── text.test.js
│   ├── bind.test.js
│   ├── if.test.js
│   └── for.test.js
├── reactivity/
│   ├── signal.test.js
│   ├── computed.test.js
│   └── watcher.test.js
└── integration/
    └── component-lifecycle.test.js
```

---

### Running Tests

Udodi uses **Vitest** for testing. Here are the most useful commands:

#### Vitest Commands

| Command                                     | Purpose                                              |
|---------------------------------------------|------------------------------------------------------|
| `npm test`                                  | Run all tests once                                   |
| `npm run test:watch`                        | Watch mode (reruns on file changes)                  |
| `npm run test:ui`                           | Beautiful browser UI                                 |
| `npx vitest list`                           | List all discovered test files                       |
| `npx vitest tests/unit/tokenizer.test.js`   | Run specific test file                               |
| `npx vitest -t "Tokenizer"`                 | Run tests matching a name pattern                    |

See [Testing](./docs/testing.md) for detailed information on running tests, writing test cases, and the testing philosophy.

---

## Current Constraints

Udodi intentionally prioritizes runtime simplicity and predictable behavior.

Current constraints include:

- Templates must render a single root element
- Reactivity is shallow
- Directive expressions are not arbitrary JavaScript
- `@for` bindings require stable keys for optimal reuse
- Nested mutations do not trigger updates automatically

These constraints are deliberate architectural decisions, not missing features.

---

## Roadmap

Curious about what's coming next? Check out our **[Roadmap](./ROADMAP.md)** to see the planned features and long-term vision for Udodi.js.

Key upcoming improvements include:

- Compiler-based directive pipeline (Lexer → Compiler → VM)
- Directive pipelines (`@text="value | filter | transform"`)
- Native scoped component styles using CSS `@scope`
- Multi-threaded Query Pool for heavy computations
- Significant runtime performance optimizations

We're committed to keeping Udodi.js **lightweight**, **fast**, and **simple**.

---

## Contributing

Contributions, discussions, and experimentation are welcome.

Please read:

- [CONTRIBUTING.md](./CONTRIBUTING.md)

before submitting pull requests.

## License

**MIT License** — feel free to use, modify, and distribute.

---

**Made with ❤️ in Nigeria.**
