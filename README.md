<p align="center">
  <img src="./assets/udodi-github-banner.png" alt="udodi logo">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/udodi">
    <img src="https://img.shields.io/npm/v/udodi.svg" alt="npm">
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/github/license/udodi-js/udodi" alt="License">
  </a>
  <a href="https://github.com/udodi-js/udodi/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/udodi-js/udodi/ci.yml?branch=main" alt="Build">
  </a>
  <a href="https://www.npmjs.com/package/udodi">
    <img src="https://img.shields.io/npm/dm/udodi" alt="Downloads">
  </a>
</p>

<p align="center">
  <a href="#installation"><strong>Installation</strong></a> •
  <a href="#usage-example"><strong>Usage Example</strong></a> •
  <a href="#documentation"><strong>Documentation</strong></a> •
  <a href="#testing"><strong>Testing</strong></a> •
  <a href="#roadmap"><strong>Roadmap</strong></a> •
  <a href="#contributing"><strong>Contributing</strong></a>
</p>

## What is Udodi?

Udodi is a lightweight, zero-dependency reactive UI runtime built around a minimalistic declarative HTML DSL, path-level reactivity, and a component-first architecture. 

Instead of relying on heavy runtime abstractions, deep proxies, or an expensive Virtual DOM reconciliation engine, Udodi tokenizes its declarative DSL, compiles it into lightweight instructions, and executes those instructions through an internal Virtual Machine (VM). 

The result is fine-grained reactivity anchored directly to DOM nodes, delivering fast execution and predictable runtime behavior. Because Udodi's DSL is compiled into VM instructions rather than evaluated as arbitrary JavaScript, it does not rely on `eval()` or `new Function()`, making it CSP-friendly and usable without a build step.

## Why Udodi?

* **No Virtual DOM**: Directly updates targeted DOM properties and text nodes, avoiding the overhead of virtual DOM tree diffing.
* **No JSX Needed**: Keeps UI structure close to native, declarative HTML templates.
* **Fine-Grained, Path-Based Reactivity**: Tracks state at the property and dependency level, enabling targeted updates without relying on deep runtime proxying.
* **No Inline JavaScript**: Directives do not execute arbitrary JavaScript expressions. Instead, they use a minimal DSL built around paths, resolver calls, and literals, making templates easier to reason about while keeping compilation fast and predictable.
* **Built-in Application Systems**: Udodi includes reactive state management with **Udodi Store**, asynchronous data management with **Query Pool**, form state and validation, and a runtime **Overlay** system for modal and dialog experiences.

## Installation

### CDN
```html
<script src="https://cdn.jsdelivr.net/npm/udodi@latest/dist/index.global.js"></script>
```
```javascript
const { render, createComponent } = Udodi;
```

### Package Manager
```bash
npm install udodi
```
```javascript
import { render, createComponent } from 'udodi';
```

## Usage Example

```javascript
import { createComponent, css, html, render } from "udodi";

const Counter = createComponent({
  name: "Counter",

  state() {
    return {
      count: 0
    };
  },

  methods: {
    increment(event) {
      this.count++;
    }
  },

  style: css`
    :scope {
      background: darkgreen;
      padding: 15px;
      border: 3px solid black;
    }

    .text {
      color: white;
      font-weight: bold;
    }
  `,

  template: (ctx) => html`
    <div>
      <div class="text" @text="count"></div>
      <button @on="click=increment">Increment</button>
    </div>
  `
});

// Mount component to DOM
render(Counter(), document.getElementById("app"));
```

## Documentation

For comprehensive guidance on building with Udodi, explore the master guides in this repository for an in-depth look at the framework, from everyday development to advanced runtime usage.

[Explore the Comprehensive Documentation Suite](https://github.com/udodi-js/udodi/tree/main/docs)

## Development

Udodi is implemented in modern ES2020+ JavaScript and bundled with [**tsup**](https://tsup.egoist.dev/) to produce tree-shakeable ESM modules and a browser IIFE build. While applications can consume Udodi without a build step (for example via a CDN), contributors should build the distribution before testing or making changes.

```bash
# Install dependencies
npm install

# Build the distribution
npm run build

# Start the playground
cd playground
npm install
npm run dev
```

### Project Workspace Tree
```text
udodi/
├── dist/              # Distribution output (ESM + IIFE)
├── docs/              # Documentation
├── packages/          # Runtime source modules
├── playground/        # Local development playground
├── tests/             # Vitest test suites
└── tsup.config.js     # Build configuration
```

## Testing

Udodi uses **Vitest** to drive low-level framework runtime verification alongside real browser integration checks. Detailed specifications regarding testing setups can be viewed in our [Runtime Testing Guide](./docs/udodi-testing.md).

| Target Suite | Purpose |
| :--- | :--- |
| **Unit Tests** | Validates isolated compiler mechanics and reactive trackers |
| **DOM Tests** | Asserts token directives modify node values correctly |
| **Integration Tests** | Monitors deep component communication and unmount scopes |

### Execution Commands
```bash
npm test                                  # Executes full test suite once
npm run test:watch                        # Enables interactive hot-revising watch engine
npm run test:ui                           # Launches the rich interactive browser testing panel
npx vitest tests/unit/tokenizer.test.js   # Target a precise engine file suite
```

## Roadmap

Current development focuses on improving runtime performance, query processing, scalability, and documentation.

See the [Roadmap](https://github.com/udodi-js/udodi/blob/main/ROADMAP.md) for details.

## Contributing

Contributions, core reviews, and optimization feedback are highly welcome. Please ensure you read the full [Contribution Guidelines](https://github.com/udodi-js/udodi/blob/main/CONTRIBUTING.md) before pushing a pull request tracking branch.

## License

Udodi is open-source software licensed under the terms of the [MIT License](https://github.com/udodi-js/udodi/blob/main/LICENSE).

<p align="center">
  Made with ❤️ in Nigeria.
</p>
