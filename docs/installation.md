# Installation

Udodi can be installed through npm or loaded directly in the browser using jsDelivr.

Choose the installation method that best fits your project.

---

## Using npm

Install Udodi with npm:

```bash
npm install udodi
```

You can then import Udodi into your application:

```js
import { createComponent } from "udodi";
```

The exact APIs you import depend on the features you use. See the [Quick Start](./quick-start.md) guide to build your first Udodi application.


## Using jsDelivr

If you want to use Udodi directly in the browser without a build step, you can load the browser distribution from jsDelivr.

Add the Udodi script to your HTML:

```html
<script src="https://cdn.jsdelivr.net/npm/udodi"></script>
```

The browser distribution exposes Udodi through the global `Udodi` object:

```js
const { createComponent } = Udodi;
```


## Choosing an Installation Method

| Method       | Best for                                                        |
| ------------ | --------------------------------------------------------------- |
| **npm**      | Applications using a JavaScript build system or package manager |
| **jsDelivr** | Direct browser usage without a build step                       |

Both approaches provide access to the Udodi runtime. The main difference is how Udodi is loaded into your application.


## Browser Usage

When using the browser distribution, include Udodi before your application code:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Udodi App</title>
</head>
<body>

    <div id="app"></div>

    <script src="https://cdn.jsdelivr.net/npm/udodi"></script>
    <script src="./app.js"></script>

</body>
</html>
```

Your `app.js` file can then access Udodi through the global `Udodi` object:

```js
const { createComponent } = Udodi;

const app = createComponent({
    // ...
});
```

See [Quick Start](./quick-start.md) for a complete example.


## Versioning

For production applications, consider pinning Udodi to a specific version rather than loading an unversioned package URL.

For example:

```html
<script src="https://cdn.jsdelivr.net/npm/udodi@VERSION"></script>
```

Replace `VERSION` with the Udodi version you want to use.

Pinning a version helps ensure that your application continues to use the same Udodi release until you explicitly upgrade it.


## Next Steps

Once Udodi is installed, continue with:

* **[Quick Start](./quick-start.md)** — Build your first Udodi application.
* **[Your First Component](./first-component.md)** — Learn how components, state, methods, computed values, templates, and component styles work together.
* **[Project Structure](./project-structure.md)** — Learn how to organize Udodi application as it grows.
