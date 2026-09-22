---
title: Roadmap
description: Where Udodi has been and where it is going — shipped foundation, near-term priorities, ecosystem work, principles, and explicit non-goals.
sidebar: false
prev: false
next: false
---

# Roadmap

This roadmap tracks where **Udodi** has been and where it is going.

Priorities may shift based on real usage, browser capabilities, technical constraints, and community feedback. New runtime capabilities should be driven by demonstrated application needs, measurable requirements, or repeated developer feedback, rather than feature parity with larger frameworks.

Udodi is a **lightweight**, **high-performance** reactive UI runtime built on modern web standards. It is **not** another React-like framework. Simplicity, fine-grained reactivity, and minimal overhead remain non-negotiable.

## Vision

- Lightweight reactive runtime with no Virtual DOM
- Fine-grained, path-level updates
- Declarative templates and directives with no arbitrary inline JavaScript
- Predictable, CSP-friendly execution through compilation to VM instructions
- Standards-based platform integration
- Efficient execution on both low-end and high-end devices
- Small core surface area with optional packages for larger application concerns

## v1.0 Foundation: Shipped

The original architecture roadmap is complete and the **Udodi library has been published to the npm registry** as [`udodi`](https://www.npmjs.com/package/udodi).

The v1.x phase is now focused on **API reference completeness, developer experience, stability, and adoption** rather than another rewrite of the core runtime.

| Area | Status | Notes |
| --- | --- | --- |
| Lexer → Compiler → VM pipeline | **Done** | Templates compile to instructions; updates avoid re-tokenizing/parsing |
| Directive model + pipelines | **Done** | Path/resolver-oriented DSL with composable transforms |
| Scoped component styles | **Done** | Component `style` / `css` with minimal-overhead scoping |
| Reactivity primitives | **Done** | Signals, shallow `reactive`, `computed`, `effect`, `bindProp`, `touch` |
| Component runtime | **Done** | `createComponent`, lifecycle, refs, watchers, overlays/modals |
| Overlay system | **Done** | Promise-based modal overlays with stacking, backdrop handling, Escape-to-close, scroll locking, focus trapping, focus restoration, and configurable z-index |
| Udodi Store | **Done** | Global + namespaced modules, actions, persistence hooks, and optional devtools bridge via `globalThis.__STORE_DEVTOOLS__` |
| Query Pool | **Done** | Dependencies, deduplication, caching, mutations, worker modules, and compute-worker execution |
| Packaging & distribution | **Done** | ESM + IIFE builds, postbuild validation, npm publishing (~23 kB min+gzip), automated GitHub Trusted Publishing |
| TypeScript declarations | **Done** | Full public API surface in `index.d.ts` (components, reactivity, Store, Query Pool, Overlay, and shared helpers) for TypeScript and editor IntelliSense consumers |
| npm distribution | **Done** | `udodi` is published to the npm registry |
| Guides and conceptual documentation | **Done** | Installation, quick start, fundamentals, templates, forms, reactivity, Store, Query Pool, Overlay, and advanced topics published on [udodi.dev](https://udodi.dev) |
| Automated performance suite & public page | **Done** | Reproducible methodology, environment capture, automated benchmarks, graphs, and result tables published at [udodi.dev/performance](https://udodi.dev/performance.html) |
| Official website | **Done** | Canonical entry point at [udodi.dev](https://udodi.dev) (documentation site; not yet built with the Udodi runtime) |

## Near-term (v1.x)

The immediate priority is to finish the remaining documentation surface and strengthen contributor tooling.

### Complete the API Reference

**Goal:** Finish the authoritative API reference so the public surface in `packages/index.js` and `index.d.ts` is fully documented for consumers.

Guides and conceptual documentation are largely complete. What remains is precise API reference coverage.

**Planned work**

- Document every public export with accurate signatures, options, return values, and behavior
- Align API pages with the current `index.d.ts` surface (components, reactivity, Store, Query Pool, Overlay, utilities)
- Cross-link API entries from guides where practical
- Keep the reference current as the 1.x API evolves

**Exit criteria:** A developer who already understands Udodi's model can look up any public API in the documentation without reading the runtime source.

### Size and Performance Budgets in CI

**Goal:** Keep the published performance evidence continuous by wiring size and key workloads into release checks.

The automated performance suite, public page, graphs, and tables are already shipped. Near-term work is limited to **ongoing measurement discipline**, not building the suite from scratch.

**Planned work**

- Track representative bundle sizes in CI
- Detect unexpected size regressions
- Track important benchmark workloads where practical
- Establish thresholds for intentional review of significant regressions
- Keep methodology and published results aligned with the suite as workloads evolve

**Exit criteria:** Releases can cite current performance and size measurements without manual re-assembly of the public page.

### JSDoc and Typed JavaScript for Contributors

**Goal:** Improve editor assistance, maintainability, and contribution safety while keeping the source code in JavaScript.

Consumer-facing TypeScript support is already shipped via the published `index.d.ts` declarations. This work focuses on the **contributor** workflow inside the repository.

**Planned work**

- Expand JSDoc coverage across public APIs and important internal modules
- Standardize on `// @ts-check` for agreed JavaScript modules
- Use `tsc` in check-only mode as part of contributor verification
- Keep the source code in JavaScript
- Keep `index.d.ts` aligned with the exported surface as the public API evolves
- Use TypeScript as a verification and documentation aid rather than a rewrite target
- Document the contributor type-checking workflow in `CONTRIBUTING.md`

**Exit criteria:** Agreed core modules pass the project's `tsc` / `@ts-check` gate, and JSDoc provides useful editor assistance for contributors.

## Developer Experience

Once the remaining documentation surface is complete, the focus moves toward making Udodi more productive to develop with.

### VS Code Extension for Udodi Templates

**Goal:** Provide first-class editor support for Udodi's `html` tagged templates so templates are as pleasant to author as the runtime is to execute.

Udodi templates live inside JavaScript or TypeScript tagged template literals:

```js
template: html`
  <div>
    <div class="text" @text="count"></div>
    <button @on="click=increment">Increment</button>
  </div>
`
```

Without dedicated language support, editors treat the template region primarily as a string. The official extension should provide an integrated authoring experience for Udodi applications and contributors.

**Planned capabilities**

| Capability | Intent |
| --- | --- |
| Syntax highlighting | HTML structure inside **html\`...\`** and aligned tags such as **css\`...\`** where practical |
| IntelliSense | Tag, attribute, directive, and snippet completion appropriate to Udodi templates |
| Directive awareness | Recognition of directives such as `@text`, `@on`, `@for`, and so on with contextual information |
| Diagnostics | Basic structural checks where reliable while avoiding false positives |
| Language embedding | Correct language-mode embedding so existing HTML/CSS tooling can work inside template regions |

The initial implementation should prioritize **correct highlighting**, **language embedding**, and **reliable completion** over aggressive diagnostics.

**Delivery**

- Published on the Visual Studio Marketplace under the Udodi project
- Documented installation path from the README and official website
- Versioned independently from `udodi`
- Clear compatibility notes between the extension and Udodi versions

**Exit criteria:** Installing the extension provides usable syntax highlighting, language embedding, and completion for **html\`...\`** templates without requiring additional project configuration.

## Ecosystem and Project Health

These initiatives support adoption and long-term project health but are not immediate blockers for the v1.x core.

### Udodi Router

**Goal:** Provide production-oriented routing for Udodi applications without increasing the complexity or dependency footprint of the core runtime.

**Planned direction**

- Distributed as a separate package, for example `udodi-router`
- Not included in the `udodi` tarball
- Declares `udodi` as a peer dependency
- Uses a clear major-version compatibility policy
- Designed around Udodi's component and reactivity model
- Minimizes unnecessary DOM churn during navigation
- Keeps routing optional so applications that do not need it do not pay the additional cost

The router should be designed around requirements demonstrated by real Udodi applications rather than attempting to reproduce every feature of established meta-framework routers.

**Exit criteria:** A documented router package provides reliable navigation patterns for Udodi applications and integrates cleanly with Udodi components.

### Udodi-Powered Website and Playground

**Goal:** Dogfood the runtime on the official site and, where practical, provide an interactive playground.

The documentation site at [udodi.dev](https://udodi.dev) is already the canonical public entry point. Future work can rebuild the site shell with Udodi itself and add a public playground or online sandbox.

**Planned direction**

- Rebuild the website shell with **Udodi** when the runtime and (optionally) router are ready for that use
- Integrate the official router when it is mature enough for production use
- Provide a public playground or online sandbox where practical

This work is **not** a near-term blocker. Documentation and API reference quality take priority over dogfooding the site implementation.

**Exit criteria:** The official site runs on Udodi where it makes sense, and optional playground tooling is available without blocking core documentation or release work.

### Showcase Applications

Build non-trivial applications that demonstrate Udodi beyond simple counters and isolated API examples.

Potential examples include:

- Multi-view applications
- Data-heavy interfaces
- Forms and validation
- Query Pool applications
- Worker-backed applications
- Applications demonstrating Store and Query Pool together

The purpose is to validate the runtime against realistic application requirements and provide useful reference implementations for users.

**Exit criteria:** Multiple representative applications demonstrate real-world Udodi usage and identify practical gaps in the runtime or documentation.

### Changelog Discipline

Maintain predictable release history for consumers depending on `udodi@1`.

**Planned work**

- Maintain meaningful release notes
- Clearly distinguish features, fixes, refactors, and breaking changes
- Link releases to their corresponding GitHub changes
- Keep npm releases and GitHub Releases synchronized
- Document migration considerations where applicable

### Browser Support Statement

Publish an explicit browser support policy.

**Planned work**

- Document supported browser families and versions
- Identify required platform capabilities
- Document known limitations
- Distinguish officially supported environments from browsers that may work incidentally

The goal is an honest and maintainable compatibility matrix rather than an unnecessarily broad support promise.

### Issue Templates and Milestones

Improve GitHub project management so real-world usage can drive future development.

**Planned work**

- Bug report template
- Feature request template
- Documentation issue template
- Performance issue template
- Clearly defined milestones
- Use recurring user feedback to prioritize future 1.x work

The roadmap should remain evidence-driven rather than becoming a static list of speculative features.

### Subpath Exports

Consider subpath exports only if real applications demonstrate that the current package entry points prevent effective tree-shaking or unnecessarily increase application bundles.

Potential future examples:

```text
udodi/reactivity
udodi/store
udodi/query
udodi/compiler
```

This is **not currently a priority**. The API should remain simple unless actual usage demonstrates a need for additional package boundaries.

## Diagnostics

The Store already exposes an optional `globalThis.__STORE_DEVTOOLS__` bridge that can be used by external development tools.

Similar **development-only** hooks could be added to the Query Pool or reactivity system if the need arises. Another option would be to build a lightweight inspector on top of the existing Store bridge.

These capabilities will remain optional and demand-driven.

A full DevTools product is **not part of the current scope** and is not a near-term goal.

## Roadmap Principles

The roadmap is guided by several principles:

### Preserve the core

New capabilities should not unnecessarily enlarge the core runtime.

### Prefer evidence over feature parity

A feature should be driven by real application requirements, measurable technical benefits, or repeated developer demand — not simply because another framework provides it.

### Keep optional concerns optional

Routing, editor tooling, diagnostics, and other ecosystem capabilities should remain separate where they do not belong in the core runtime.

### Measure performance honestly

Performance claims should be supported by reproducible methodology and publicly available evidence.

### Maintain API stability

Once an API is part of a stable 1.x release, changes should remain backward compatible wherever practical.

Breaking API changes require a clear migration path and should be reserved for a deliberate major release.

### Documentation is part of the product

A runtime is only useful if developers can understand and apply it without reading its implementation.

## Explicit Non-Goals

The following remain out of scope unless strong evidence forces a deliberate change in philosophy:

- Recreating React or adopting a Virtual DOM
- Requiring JSX for application development
- Requiring a heavy mandatory build step for end users
- Arbitrary JavaScript expressions inside templates
- Growing a large framework ecosystem inside the core `udodi` package
- Turning the core package into a meta-framework
- Moving routing, SSG, website tooling, or editor extensions into the core runtime
- Building a full DevTools product without demonstrated demand
- Rewriting the runtime in TypeScript solely for the sake of using TypeScript

## Release Posture

| Release line | Intent |
| --- | --- |
| **1.0.x** | Stability, documentation, fixes, release infrastructure |
| **1.x feature releases** | Backward-compatible improvements driven by documentation, tooling, performance evidence, and real applications |
| **2.0** | Intentional breaking changes with a clear migration path |

### Distribution

| Deliverable | Form |
| --- | --- |
| **Core runtime** | `udodi` on npm |
| **Type declarations** | `index.d.ts` published with the package |
| **Website** | Official site at [udodi.dev](https://udodi.dev) (docs today; Udodi-powered shell later) |
| **Router** | Separate companion package |
| **Editor support** | VS Code extension |
| **Diagnostics** | Optional development tooling |

The core runtime remains the primary product. Companion packages and developer tooling should extend the ecosystem without forcing additional dependencies or complexity onto applications that do not need them.

## Summary

### Shipped

- Compiler / VM runtime
- Declarative directive system
- Scoped component styles
- Fine-grained reactivity
- Component runtime
- Overlay system
- Udodi Store
- Query Pool
- Worker-based execution
- Packaging (ESM + IIFE) and npm distribution with Trusted Publishing
- Full public TypeScript declarations (`index.d.ts`) covering components, reactivity, Store, Query Pool, Overlay, and shared helpers
- Guides and conceptual documentation on [udodi.dev](https://udodi.dev)
- Automated performance suite and public [performance page](https://udodi.dev/performance.html) with methodology, graphs, and result tables
- Official website at [udodi.dev](https://udodi.dev) as the canonical documentation entry point
- `udodi` published to the npm registry

### Next

1. Complete the API reference
2. Size and performance budgets in CI
3. JSDoc and `@ts-check` / `tsc` contributor workflow
4. VS Code extension for **html\`...\`** templates
5. Separate Udodi Router package
6. Udodi-powered website shell and optional playground (follow-on)
7. Showcase applications and broader adoption work

## North Star

**Stay small, measurable, and usable.**

Udodi should grow capability around its core through **documentation, editor support, routing, performance evidence, and real-world adoption** without compromising the simplicity, predictability, and low overhead of the runtime itself.

---

**Last updated:** September 17, 2026