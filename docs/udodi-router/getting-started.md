---
title: Getting Started
description: Install Udodi Router and build your first routed Udodi application.
---

# Getting Started

Udodi Router adds client-side routing to Udodi applications without introducing another component model or reactivity system. This guide covers installation, route configuration, navigation links, and rendering your first routed application.

## Prerequisites

You should be familiar with the basics of [Udodi](https://udodi.dev), particularly `createComponent()`, `html`, and `render()`.

## Installation

Install Udodi and Udodi Router:

::: code-group

```sh [npm]
npm install udodi udodi-router
```

```sh [pnpm]
pnpm add udodi udodi-router
```

```sh [yarn]
yarn add udodi udodi-router
```

```sh [bun]
bun add udodi udodi-router
```

:::

`udodi` is a peer dependency. Declare it in your application alongside `udodi-router`; the router does not bundle a separate copy of Udodi.

## Create your first routed application

The example below defines two pages, adds a fallback route, creates navigation links, and renders the active page through `router.RouterView()`.

### 1. Define route components

Create page components as ordinary Udodi components:

```js
import { createComponent, html, render } from "udodi";
import { createRouter } from "udodi-router";

const Home = createComponent({
  name: "Home",
  template: html`
    <section>
      <h1>Welcome Home</h1>
      <p>This page is rendered by Udodi Router.</p>
    </section>
  `,
});

const About = createComponent({
  name: "About",
  template: html`
    <section>
      <h1>About</h1>
      <p>Learn more about this application.</p>
    </section>
  `,
});

const NotFound = createComponent({
  name: "NotFound",
  template: html`
    <section>
      <h1>Page not found</h1>
      <p>The requested page does not exist.</p>
    </section>
  `,
});
```

### 2. Configure the router

Pass an array of route records to `createRouter()`. Each record maps a path to a component:

```js
const router = createRouter({
  routes: [
    {
      path: "/",
      component: Home,
      meta: { title: "Home" },
    },
    {
      path: "/about",
      component: About,
      meta: { title: "About" },
    },
    {
      path: "*",
      component: NotFound,
      meta: { title: "Page not found" },
    },
  ],
});
```

The `*` route is a root-level fallback for unmatched paths. It must be declared at the root of the route table.

Udodi Router uses HTML5 history by default. For the full path syntax and matching rules, see [Routes](./routes.md).

### 3. Add navigation links and a route outlet

Use `router.Link()` for navigation and `router.RouterView()` to render the active route:

```js
const App = createComponent({
  name: "App",
  template: html`
    <header>
      <nav>
        ${router.Link({ to: "/", exact: true }, html`
          <a @class="isActive=>'active' 'nav-link'">Home</a>
        `)}

        ${router.Link({ to: "/about" }, html`
          <a @class="isActive=>'active' 'nav-link'">About</a>
        `)}
      </nav>
    </header>

    <main>
      ${router.RouterView()}
    </main>
  `,
});
```

The second argument to `router.Link()` is an ordinary Udodi template. The router exposes `isActive` in that template's context so the link can respond to the committed route. Setting `exact: true` on the Home link restricts the active state to the exact root path.

`RouterView` renders the component associated with the active route. The same outlet can also appear inside parent layouts when you use nested routes.

See [Links and Outlets](./links-and-outlets.md) for link behavior, active states, nested outlets, and view lifecycle details.

### 4. Mount the application

Render the root component into an element in your HTML document:

```js
render(App(), "#app");
```

Your HTML needs a matching mount point:

```html
<div id="app"></div>
```

Navigating to `/` renders Home, `/about` renders About, and any unmatched path renders NotFound.

## Using a CDN

Udodi Router also provides browser-global builds. Load Udodi before the router:

```html
<script src="https://cdn.jsdelivr.net/npm/udodi@latest/dist/index.global.js"></script>
<script src="https://cdn.jsdelivr.net/npm/udodi-router@latest/dist/index.global.js"></script>

<div id="app"></div>

<script>
  const { createComponent, html, render } = Udodi;
  const { createRouter } = UdodiRouter;

  // Define components, create the router,
  // compose the App component, and call render().
</script>
```

The browser globals are `Udodi` and `UdodiRouter`. The application code is otherwise the same as the ES-module example.

The `@latest` tag always resolves to the newest published release. For production, pin explicit package versions so upgrades remain deliberate and reproducible.

## Deployment considerations

### HTML5 history

The default history mode produces clean paths such as `/about`. Configure your production web server to serve the application entry HTML for all routes that the client router handles. Without that fallback, a direct request to a nested URL can return a server-side 404 before the router starts.

### Hash history

If your server cannot provide the necessary fallback, use hash history:

```js
import {
  createRouter,
  createHashHistory,
} from "udodi-router";

const router = createRouter({
  routes,
  history: createHashHistory(),
});
```

Client routes are stored in the URL hash, so the server does not need to resolve each application path.

### Applications under a subpath

If the application is hosted below the domain root, set a base path:

```js
const router = createRouter({
  routes,
  base: "/app",
});
```

The base must match the deployment location. Udodi Router applies it consistently to history management and route matching.

For history adapters and scroll restoration, see [History and Scroll](./history-and-scroll.md).
