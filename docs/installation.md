# Installation

Udodi can be installed with a package manager or loaded directly in the browser from a CDN such as jsDelivr.

Choose the installation method that best fits your project.


## Using npm

Install Udodi:

```bash
npm install udodi
```

Other package managers work the same way:

```bash
pnpm add udodi
# or
yarn add udodi
```

Import the APIs you need:

```js
import { createComponent, render } from "udodi";
```

The exact APIs you import depend on the features you use. See [Quick Start](./quick-start.md) to build your first Udodi application.

### TypeScript

Udodi ships its own type declarations (`index.d.ts`). No `@types/udodi` package is required.

Editors and `tsc` can resolve the declarations directly from the published package.


## Using jsDelivr (Browser / CDN)

For use without a build step, load the **IIFE / global** build from jsDelivr:

```html
<script src="https://cdn.jsdelivr.net/npm/udodi@latest/dist/index.global.js"></script>
```

The IIFE build exposes a global **`Udodi`** object:

```js
const { createComponent, render } = Udodi;
```

> **Production:** Prefer a pinned version instead of `@latest`. The `@latest` tag always points to the newest published release.


## Choosing an Installation Method

| Method                | Best for                                                                           |
| --------------------- | ---------------------------------------------------------------------------------- |
| **npm / pnpm / yarn** | Applications using a package manager, ESM imports, TypeScript, or a bundler        |
| **jsDelivr (CDN)**    | Prototypes, demos, static pages, and applications that do not require a build step |

Both methods provide the same Udodi runtime. The difference is how the library is loaded: package-manager installations use module imports, while the CDN IIFE build exposes the global `Udodi` object.


## Browser Usage

Include Udodi **before** your application script:

```html
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
  <script src="https://cdn.jsdelivr.net/npm/udodi@1.0.4/dist/index.global.js"></script>
  <script src="./app.js"></script>
</body>
</html>
```

In `app.js`:

```js
const { createComponent, render } = Udodi;

const App = createComponent({
  name: "App",
  // ...
});

render(App(), document.getElementById("app"));
```

See [Quick Start](./quick-start.md) for a complete example.


## Versioning

For production applications, **pin Udodi to a specific version** so upgrades are intentional and predictable.

### npm

You can specify an exact version in `package.json`:

```json
{
  "dependencies": {
    "udodi": "1.0.4"
  }
}
```

Commit your lockfile as well to ensure reproducible installations.

### CDN

Pin the CDN URL to a specific version:

```html
<script src="https://cdn.jsdelivr.net/npm/udodi@1.0.4/dist/index.global.js"></script>
```

Replace `1.0.4` with the version you want to use. See [npm](https://www.npmjs.com/package/udodi) for published releases.

Avoid unversioned or `@latest` CDN URLs in production because they automatically change when new versions are published.


## Next Steps

Once Udodi is installed, continue with:

* **[Quick Start](./quick-start.md)** — Build your first Udodi application
* **[Your First Component](./first-component.md)** — Learn about state, methods, computed values, templates, and styles
* **[Project Structure](./project-structure.md)** — Organize an application as it grows
