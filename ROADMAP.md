# Udodi.js Roadmap

This roadmap outlines the planned evolution of **Udodi.js** and its underlying runtime architecture. It represents the current direction of the project and may evolve as implementation details are refined and new opportunities emerge.

Udodi.js is focused on building a **lightweight, high-performance reactive UI runtime** built on modern web standards. It is **not** intended to become another React-like framework and will continue to prioritize simplicity, performance, and fine-grained reactivity over framework complexity.

## Vision

Udodi.js aims to provide:

- A lightweight reactive runtime
- Fine-grained updates without Virtual DOM overhead
- Declarative templates and directives
- Predictable runtime behavior
- Standards-based web platform integration
- Minimal runtime and memory overhead
- Efficient execution on both low-end and high-end devices

## Runtime Re-Architecture

### Lexer → Compiler → Virtual Machine (VM)

The current runtime architecture will be completely redesigned around a compilation pipeline.

**Motivation**

Today, directive processing involves repeated work during reactive updates, including:

- Directive slicing
- Tokenization
- Parsing
- Runtime interpretation

Although functional, this approach introduces avoidable overhead during state changes and effect execution.

### Planned Architecture

```text
Template
    ↓
Lexer
    ↓
Tokens
    ↓
Compiler
    ↓
Instructions
    ↓
Virtual Machine (Execute)
```

### Objectives

- Parse directives only once
- Compile directives into executable instructions
- Eliminate repeated tokenization and parsing during updates
- Reduce runtime CPU overhead
- Improve execution efficiency
- Create a foundation for future compiler optimizations

### Expected Benefits

- Faster reactive updates
- Lower memory consumption
- Reduced runtime overhead
- Better scalability for large component trees
- More predictable performance characteristics

## Directive Pipelines

### Declarative Data Transformation

Udodi.js intentionally avoids arbitrary JavaScript expressions inside templates to preserve predictability, security, and optimization opportunities.

To improve composability, **directive pipelines** will be introduced.

**Example**

```html
<span @text="user.name | sanitize | firstUppercase"></span>
```

**Goals**

- Support reusable transformations
- Improve template readability
- Encourage declarative programming patterns
- Eliminate the need for inline JavaScript expressions
- Enable compiler-level optimization opportunities

**Potential Use Cases**

```html
@text="user.name | trim | firstUppercase"
@text="price | currency"
@text="content | sanitize"
@text="description | truncate"
```

**Benefits**

- Cleaner templates
- Reusable transformation logic
- Better maintainability
- Consistent directive behavior
- Improved compiler optimization potential

## Scoped Component Styles

### New Component Option: `style`

Udodi.js will introduce a new `style` option within Component Options to support component-scoped CSS.

**Motivation**

Many frameworks implement CSS isolation by attaching generated attributes to every element. This introduces additional DOM mutations, memory usage, and runtime overhead.

**Planned Implementation**

Udodi.js will leverage the emerging CSS `@scope` specification to provide native CSS isolation. Rather than injecting generated attributes into every DOM node, Udodi.js will surgically establish a CSS scope boundary at the component root element, allowing descendant styles to remain isolated with significantly lower DOM and runtime overhead.

**Example**

```js
export const UserCard = createComponent({
    style: /*css*/`
        .title {
            font-weight: bold;
        }
    `
});
```

**Expected Benefits**

- Cleaner DOM output
- Better performance
- Lower memory usage
- Simpler generated markup
- Standards-based CSS encapsulation

## Reimagined Udodi Query Pool

### Multi-Threaded Data Processing Architecture

The Udodi Query Pool will be redesigned to move computationally expensive work away from the UI thread.

**Planned Architecture**

```text
UI Thread
    │
    ▼
Main Worker
    │
    ▼
Compute Worker Pool
```

**Key Technologies**

- `SharedArrayBuffer` (SAB)
- Shared state synchronization
- Efficient inter-worker messaging

**Core Features**

- Dependency Graph
- Worker Pool Manager
- Smart Scheduling
- Deduplication & Caching
- Data Coalescing
- Invalidation Graph

**Expected Benefits**

- Free the UI thread from heavy workloads
- Improved application responsiveness
- Better utilization of multi-core processors
- Higher scalability with large datasets
- Reduced frame drops and UI stalls

## Areas Under Evaluation

- Compiler Optimizations (instruction-level and execution-level)
- Runtime Diagnostics & Developer Tools
- Performance Instrumentation & Profiling
- Directive Ecosystem Expansion
- Improved Developer Tooling (without heavy build steps)

## Explicit Non-Goals

To preserve the philosophy of Udodi.js, the following are **not** current goals:

- Recreating React
- Implementing a Virtual DOM
- Requiring JSX
- Heavy compile-time build systems
- Framework-specific template languages
- Excessive runtime abstractions
- Large framework ecosystems that compromise simplicity

Udodi.js will continue to focus on **lightweight, standards-based, declarative UI development**.

---

**Status**: Aspirational and subject to change. Priorities may shift based on implementation progress, browser capabilities, and community feedback.

**Last Updated**: June 12, 2026