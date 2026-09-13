# Installation

Udodi can be installed with a package manager or loaded directly in the browser from a CDN such as jsDelivr.

Choose the installation method that best fits your project.


## Using package managers

Install Udodi:

::: code-group

```sh [npm]
npm install udodi
```

```sh [pnpm]
pnpm add udodi
```

```sh [yarn]
yarn add udodi
```

```sh [bun]
bun add udodi
```

:::

Import the APIs you need:

```js
import { createComponent, render } from "udodi";
```

The exact APIs you import depend on the features you use. See [Quick Start](./quick-start.md) to build your first Udodi application.

### TypeScript

Udodi ships its own type declarations (`index.d.ts`). No `@types/udodi` package is required.

Editors and `tsc` can resolve the declarations directly from the published package.

## Choosing an Installation Method

| Method                | Best for                                                                           |
| --------------------- | ---------------------------------------------------------------------------------- |
| **npm / pnpm / yarn / bun** | Applications using a package manager, ESM imports, TypeScript, or a bundler        |
| **jsDelivr (CDN)**    | Prototypes, demos, static pages, and applications that do not require a build step |

Both methods provide the same Udodi runtime. The difference is how the library is loaded: package-manager installations use module imports, while the CDN IIFE build exposes the global `Udodi` object.


## Browser Usage

Include Udodi **before** your application script:

::: code-group

```html [jsDelivr]
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Udodi App</title>
</head>
<body>
  <div id="app"></div>

  <!-- Pin a version in production -->
  <script src="https://cdn.jsdelivr.net/npm/udodi@1.1.1/dist/index.global.js"></script>
  <script src="./app.js"></script>
</body>
</html>
```

```html [unpkg]
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Udodi App</title>
</head>
<body>
  <div id="app"></div>

  <!-- Pin a version in production -->
  <script src="https://unpkg.com/udodi@1.1.1/dist/index.global.js"></script>
  <script src="./app.js"></script>
</body>
</html>
```

:::

> **Production:** Prefer a pinned version instead of `@latest`. The `@latest` tag always points to the newest published release.

In `app.js`:

```js
const { createComponent, render } = Udodi;

const App = createComponent({
  name: "App",
  // ...
});

render(App(), "#app");
```

## Versioning

For production applications, **pin Udodi to a specific version** so upgrades are intentional and predictable.

### npm

You can specify an exact version in `package.json`:

```json
{
  "dependencies": {
    "udodi": "1.1.1"
  }
}
```

Commit your lockfile as well to ensure reproducible installations.

### CDN

Pin the CDN URL to a specific version:

```html
<script src="https://cdn.jsdelivr.net/npm/udodi@1.1.1/dist/index.global.js"></script>
```

Replace `1.1.1` with the version you want to use. See [npm](https://www.npmjs.com/package/udodi) for published releases.

Avoid unversioned or `@latest` CDN URLs in production because they automatically change when new versions are published.
