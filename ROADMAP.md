# Udodi Roadmap

This roadmap tracks where **Udodi** has been and where it is going.

Priorities may shift based on real usage, browser capabilities, technical constraints, and community feedback. New runtime capabilities should be driven by demonstrated application needs, measurable requirements, or repeated developer feedback; not by feature parity with larger frameworks.

Udodi is a **lightweight, high-performance reactive UI runtime** built on modern web standards. It is **not** another React-like framework. Simplicity, fine-grained reactivity, and minimal overhead remain non-negotiable.

---

## Vision

* Lightweight reactive runtime with no Virtual DOM
* Fine-grained, path-level updates
* Declarative templates and directives with no arbitrary inline JavaScript
* Predictable, CSP-friendly execution through compilation to VM instructions
* Standards-based platform integration
* Efficient execution on both low-end and high-end devices
* Small core surface area with optional packages for larger application concerns

---

## Status: v1.0 Foundation — Shipped

The original architecture roadmap is complete and the **Udodi library has been published to the npm registry** as `udodi`.

The v1.x phase is now focused on **documentation, developer experience, performance evidence, stability, and adoption** rather than another rewrite of the core runtime.

| Area                           | Status   | Notes                                                                                                                     |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| Lexer → Compiler → VM pipeline | **Done** | Templates compile to instructions; updates avoid re-tokenizing/parsing                                                    |
| Directive model + pipelines    | **Done** | Path/resolver-oriented DSL with composable transforms                                                                     |
| Scoped component styles        | **Done** | Component `style` / `css` with low-overhead scoping                                                                       |
| Reactivity primitives          | **Done** | Signals, shallow `reactive`, `computed`, `effect`, `bindProp`, `touch`                                                    |
| Component runtime              | **Done** | `createComponent`, lifecycle, refs, watchers, overlays/modals                                                             |
| Overlay system                 | **Done** | Promise-based modal overlays with stacking, backdrop handling, Escape-to-close, scroll locking, focus trapping, focus restoration, and configurable z-index |
| Udodi Store                    | **Done** | Global + namespaced modules, actions, persistence hooks, and optional devtools bridge via `globalThis.__STORE_DEVTOOLS__` |
| Query Pool                     | **Done** | Dependencies, caching, mutations, worker modules, and compute-worker execution                                            |
| Packaging & types              | **Done** | ESM + IIFE, `index.d.ts`, postbuild validation, and npm publishing (~23 kB min+gzip)                                      |
| npm distribution               | **Done** | `udodi` is published to the npm registry with automated GitHub Trusted Publishing                                         |

---

# Near-term — v1.x

The immediate priority is to make the existing runtime **well documented, measurable, and pleasant to develop with**.

## 1. Complete the Documentation

**Goal:** Provide documentation that accurately reflects the public API and supports real application development.

### Planned work

* Align all guides with the exported surface in `packages/index.js` and `index.d.ts`
* Cover components, directives, reactivity, Store, Query Pool, and overlays
* Provide practical recipes for:

  * Forms
  * Lists
  * Parent/child data flow with `bindProp`
  * Optimistic updates
  * Reactive state management
  * Asynchronous data management
* Clearly explain when to use:

  * Component state
  * Udodi Store
  * Query Pool
* Ensure examples work with both:

  * CDN usage
  * Package-manager installations
* Document worker-based Query Pool usage and constraints
* Document public APIs and important runtime behavior without requiring users to read source code

**Exit criteria:** A new developer can build a small multi-view application from the documentation without reading the runtime source.

---

## 2. Performance Test Suite and Public Performance Page

**Goal:** Produce reproducible performance evidence rather than relying on marketing claims.

### Planned work

* Build an automated performance suite suitable for regression checks in CI where practical
* Benchmark metrics aligned with Udodi's architecture:

  * Mount performance
  * Update cost
  * List rendering throughput
  * Mount/unmount performance
  * Reactive update throughput
  * Memory retention
  * Heap behavior where measurable
* Compare representative workloads against selected frameworks and runtimes using consistent methodology
* Publish benchmark methodology and raw results
* Provide instructions for reproducing benchmarks locally
* Track representative bundle sizes
* Establish size budgets for important distribution entry points
* Publish a public performance page as part of the official project presence

The goal is not to claim that Udodi is universally faster. The goal is to make performance characteristics **measurable, reproducible, and transparent**.

**Exit criteria:** Each release can cite performance and size measurements that third parties can reproduce using the published methodology.

---

## 3. JSDoc and Typed JavaScript for Contributors

**Goal:** Improve editor assistance, maintainability, and contribution safety while keeping the source code in JavaScript.

### Planned work

* Expand JSDoc coverage across public APIs and important internal modules
* Standardize on `// @ts-check` for agreed JavaScript modules
* Use `tsc` in check-only mode as part of contributor verification
* Keep the source code in JavaScript
* Continue publishing `.d.ts` declarations for package consumers
* Use TypeScript as a verification and documentation aid rather than a rewrite target
* Document the contributor type-checking workflow in `CONTRIBUTING.md`

**Exit criteria:** Agreed core modules pass the project's `tsc` / `@ts-check` gate, and JSDoc provides useful editor assistance for contributors.

---

# Next — Developer Experience

Once the documentation and performance foundations are established, the focus moves toward making Udodi more productive to develop with.

## 4. VS Code Extension for Udodi Templates

**Goal:** Provide first-class editor support for Udodi's `html` tagged templates so templates are as pleasant to author as the runtime is to execute.

Udodi templates live inside JavaScript or TypeScript tagged template literals:

```js
template: () => html`
  <div class="text" @text="count"></div>
  <button @on="click=increment">Increment</button>
`
```

Without dedicated language support, editors treat the template region primarily as a string. The official extension should provide an integrated authoring experience for Udodi applications and contributors.

### Planned capabilities

| Capability          | Intent                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Syntax highlighting | HTML structure inside **html\`...\`** and aligned tags such as **css\`...\`** where practical                             |
| IntelliSense        | Tag, attribute, directive, and snippet completion appropriate to Udodi templates                                 |
| Directive awareness | Recognition of directives such as `@text`, `@on`, `@for`, `@if`, `@bind`, and `@ref` with contextual information |
| Diagnostics         | Basic structural checks where reliable while avoiding false positives                                            |
| Language embedding  | Correct language-mode embedding so existing HTML/CSS tooling can work inside template regions                    |

The initial implementation should prioritize **correct highlighting, language embedding, and reliable completion** over aggressive diagnostics.

### Delivery

* Published on the Visual Studio Marketplace under the Udodi project
* Documented installation path from the README and official website
* Versioned independently from `udodi`
* Clear compatibility notes between the extension and Udodi versions

**Exit criteria:** Installing the extension provides usable syntax highlighting, language embedding, and completion for **html\`...\`** templates without requiring additional project configuration.

---

## 5. Official Website

**Goal:** Establish a single public entry point for Udodi that dogfoods the runtime and brings together documentation, examples, installation information, and performance evidence.

### Planned work

* Provide a canonical home for:

  * Installation
  * Documentation
  * Examples
  * API references
  * Performance results
  * Project information
* Build the website with **Udodi**
* Use the official router when it is mature enough for production use
* Provide a public playground or online sandbox where practical
* Link the website clearly from npm and GitHub

### Phased delivery

1. Information architecture and documentation quality
2. Udodi-powered website shell
3. Router integration when the router is stable
4. Optional public playground / sandbox

The website should not block documentation work or require router maturity before useful content can be published.

**Exit criteria:** The chosen domain becomes the canonical entry point for Udodi installation, documentation, examples, and performance information.

---

# Follow-on — Ecosystem and Project Health

These initiatives support adoption and long-term project health but are not immediate blockers for the v1.x core.

## 6. Udodi Router

**Goal:** Provide production-oriented routing for Udodi applications without increasing the complexity or dependency footprint of the core runtime.

### Planned direction

* Distributed as a separate package, for example `udodi-router`
* Not included in the `udodi` tarball
* Declares `udodi` as a peer dependency
* Uses a clear major-version compatibility policy
* Designed around Udodi's component and reactivity model
* Minimizes unnecessary DOM churn during navigation
* Keeps routing optional so applications that do not need it do not pay the additional cost

The router should be designed around requirements demonstrated by real Udodi applications rather than attempting to reproduce every feature of established meta-framework routers.

**Exit criteria:** A documented router package provides reliable navigation patterns for Udodi applications and integrates cleanly with Udodi components.

---

## 7. Showcase Applications

Build non-trivial applications that demonstrate Udodi beyond simple counters and isolated API examples.

Potential examples include:

* Multi-view applications
* Data-heavy interfaces
* Forms and validation
* Query Pool applications
* Worker-backed applications
* Applications demonstrating Store and Query Pool together

The purpose is to validate the runtime against realistic application requirements and provide useful reference implementations for users.

**Exit criteria:** Multiple representative applications demonstrate real-world Udodi usage and identify practical gaps in the runtime or documentation.

---

## 8. Changelog Discipline

Maintain predictable release history for consumers depending on `udodi@1`.

### Planned work

* Maintain meaningful release notes
* Clearly distinguish features, fixes, refactors, and breaking changes
* Link releases to their corresponding GitHub changes
* Keep npm releases and GitHub Releases synchronized
* Document migration considerations where applicable

---

## 9. Browser Support Statement

Publish an explicit browser support policy.

### Planned work

* Document supported browser families and versions
* Identify required platform capabilities
* Document known limitations
* Distinguish officially supported environments from browsers that may work incidentally

The goal is an honest and maintainable compatibility matrix rather than an unnecessarily broad support promise.

---

## 10. Issue Templates and Milestones

Improve GitHub project management so real-world usage can drive future development.

### Planned work

* Bug report template
* Feature request template
* Documentation issue template
* Performance issue template
* Clearly defined milestones
* Use recurring user feedback to prioritize future 1.x work

The roadmap should remain evidence-driven rather than becoming a static list of speculative features.

---

## 11. Size and Performance Budgets in CI

Once the benchmark and measurement infrastructure is established:

* Track representative bundle sizes in CI
* Detect unexpected size regressions
* Track important benchmark workloads
* Establish thresholds where practical
* Require intentional review for significant regressions

The goal is to preserve Udodi's lightweight architecture as the project grows.

---

## 12. Subpath Exports

Consider subpath exports only if real applications demonstrate that the current package entry points prevent effective tree-shaking or unnecessarily increase application bundles.

Potential future examples:

```text
udodi/reactivity
udodi/store
udodi/query
udodi/compiler
```

This is **not currently a priority**. The API should remain simple unless actual usage demonstrates a need for additional package boundaries.

---

# Diagnostics

The Store already exposes an optional `globalThis.__STORE_DEVTOOLS__` bridge that can be used by external development tools.

Similar **development-only** hooks could be added to the Query Pool or reactivity system if the need arises. Another option would be to build a lightweight inspector on top of the existing Store bridge.

These capabilities will remain optional and demand-driven.

A full DevTools product is **not part of the current scope** and is not a near-term goal.

---

# Roadmap Principles

The roadmap is guided by several principles:

### Preserve the core

New capabilities should not unnecessarily enlarge the core runtime.

### Prefer evidence over feature parity

A feature should be driven by real application requirements, measurable technical benefits, or repeated developer demand; not simply because another framework provides it.

### Keep optional concerns optional

Routing, editor tooling, diagnostics, and other ecosystem capabilities should remain separate where they do not belong in the core runtime.

### Measure performance honestly

Performance claims should be supported by reproducible methodology and publicly available evidence.

### Maintain API stability

Once an API is part of a stable 1.x release, changes should remain backward compatible wherever practical.

Breaking API changes require a clear migration path and should be reserved for a deliberate major release.

### Documentation is part of the product

A runtime is only useful if developers can understand and apply it without reading its implementation.

---

# Explicit Non-Goals

The following remain out of scope unless strong evidence forces a deliberate change in philosophy:

* Recreating React or adopting a Virtual DOM
* Requiring JSX for application development
* Requiring a heavy mandatory build step for end users
* Arbitrary JavaScript expressions inside templates
* Growing a large framework ecosystem inside the core `udodi` package
* Turning the core package into a meta-framework
* Moving routing, SSG, website tooling, or editor extensions into the core runtime
* Building a full DevTools product without demonstrated demand
* Rewriting the runtime in TypeScript solely for the sake of using TypeScript

---

# Release Posture

| Release line             | Intent                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **1.0.x**                | Stability, documentation, fixes, release infrastructure                                                        |
| **1.x feature releases** | Backward-compatible improvements driven by documentation, tooling, performance evidence, and real applications |
| **2.0**                  | Intentional breaking changes with a clear migration path                                                       |

## Distribution

| Deliverable        | Form                           |
| ------------------ | ------------------------------ |
| **Core runtime**   | `udodi` on npm                 |
| **Router**         | Separate companion package     |
| **Editor support** | VS Code extension              |
| **Website**        | Official site built with Udodi |
| **Diagnostics**    | Optional development tooling   |

The core runtime remains the primary product. Companion packages and developer tooling should extend the ecosystem without forcing additional dependencies or complexity onto applications that do not need them.

---

# Summary

### Shipped

* Compiler / VM runtime
* Declarative directive system
* Scoped component styles
* Fine-grained reactivity
* Component runtime
* Overlay system
* Udodi Store
* Query Pool
* Worker-based execution
* Packaging and type declarations
* ESM and browser IIFE distributions
* Automated npm publishing with Trusted Publishing
* `udodi` published to the npm registry

### Next

1. Complete documentation
2. Performance test suite and public performance page
3. JSDoc and `@ts-check` / `tsc` contributor workflow
4. VS Code extension for **html\`...`** templates
5. Official Udodi-powered website
6. Separate Udodi Router package
7. Showcase applications and broader adoption work

---

## North Star

**Stay small, measurable, and usable.**

Udodi should grow capability around its core through **documentation, editor support, routing, performance evidence, and real-world adoption** without compromising the simplicity, predictability, and low overhead of the runtime itself.

---

**Last updated:** August 2026
