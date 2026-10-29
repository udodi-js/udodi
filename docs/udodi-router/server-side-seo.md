---
title: Server-Side SEO
description: Match Udodi Router routes, resolve metadata, and generate document head HTML on the server without browser dependencies.
---

# Server-Side SEO

Udodi Router provides a browser-independent API for resolving route metadata and generating HTML head markup on the server.

This is useful when search engines, link previews, and other clients need document metadata in the initial HTML response rather than waiting for client-side JavaScript.

The server API does not require a full server-side rendering framework. You can integrate it into a Node.js server, an edge handler, or a static-generation pipeline.

**Important:** Server-side metadata generation produces the document head. It does not render your Udodi component tree or generate the page body automatically.

## The server entry point

Import server-side helpers from `udodi-router/server`:

```js
import {
  createMatcher,
  matchRoutes,
  resolveMetadata,
  renderMetadata,
  resolveHead,
} from "udodi-router/server";
```

The server entry is separate from the browser navigation runtime. Its matching and metadata helpers do not depend on browser history, the DOM, or the client-side head manager.

| Export | Purpose |
| --- | --- |
| `createMatcher()` | Compile a reusable route matcher. |
| `matchRoutes()` | Compile routes and match a pathname in one call. |
| `resolveMetadata()` | Resolve semantic metadata for a matched route chain. |
| `renderMetadata()` | Convert metadata into an HTML string. |
| `resolveHead()` | Perform matching, optionally run loaders, resolve metadata, and render the head in one call. |

## How the pipeline works

The standard SEO workflow is:

```text
Incoming request
       │
       ▼
Match pathname
       │
       ▼
Run route loaders
       │
       ▼
Resolve metadata
       │
       ▼
Render head HTML
       │
       ▼
Insert into document shell
       │
       ▼
Return HTML response
```

Udodi Router performs the route matching, loader execution when enabled, metadata resolution, and head generation. Your server remains responsible for handling the request, choosing the response status, and returning the completed document.

## The one-shot helper: `resolveHead()`

For most server-side SEO integrations, `resolveHead()` is the simplest entry point. It accepts your route table and request pathname, then returns the match, semantic metadata, generated HTML, and loader results.

```js
import { resolveHead } from "udodi-router/server";

const result = await resolveHead({
  routes,
  pathname: "/products/42",
  defaults: {
    openGraph: {
      siteName: "Example Store",
    },
  },
});

console.log(result.match);
console.log(result.metadata);
console.log(result.head);
console.log(result.loaderData);
```

The returned object has this shape:

| Property | Description |
| --- | --- |
| `match` | Match result containing `path`, `params`, `record`, and `matched`, or `null` if no route matches. |
| `metadata` | Resolved semantic metadata, or `null` if no route matches. |
| `head` | Generated HTML string for the document head. Empty when no route matches. |
| `loaderData` | A `Map` keyed by matched route records and containing their loader results. |

When `runLoaders` is enabled, route loaders run before metadata resolution, allowing dynamic metadata to use their results.

### `resolveHead()` options

| Option | Description |
| --- | --- |
| `routes` | Route-record array. Required unless `matcher` is supplied. |
| `matcher` | Reusable matcher created with `createMatcher(routes, options)`. When supplied, `routes` and `base` are not used for matching. |
| `pathname` | Request pathname only, without query string or hash. Required. |
| `base` | Optional deployment base path, such as `/app`. Used when `resolveHead()` creates a matcher from `routes`. Defaults to `""`. |
| `defaults` | Static metadata or a metadata callback used as the default layer. |
| `context` | Shared application context passed to loaders and metadata callbacks. |
| `query` | Query-parameter object supplied to loaders and metadata callbacks. |
| `signal` | Optional `AbortSignal`, useful for cancelling request work. |
| `runLoaders` | Whether to execute route loaders. Defaults to `true`. |
| `loaderData` | Existing loader results to use when `runLoaders` is `false`. |
| `includeScripts` | Whether to emit configured metadata scripts in the generated head. Defaults to `false`. |

The helper rejects invalid required arguments and propagates loader or metadata-resolution failures. Handle those failures at your server's request boundary.

For repeated requests against the same route table, compile a matcher once and pass it to each call. This skips route compilation inside `resolveHead()` while retaining its loader, metadata, and head-rendering pipeline.

```js
import { createMatcher, resolveHead } from "udodi-router/server";

const matcher = createMatcher(routes, { base: "/app" });

export async function handleRequest(url) {
  return resolveHead({
    matcher,
    pathname: url.pathname,
  });
}
```

### Pathname, query, and hash

`pathname` must contain only the pathname. Do not pass a complete URL or append the query string and fragment to it.

If loaders or metadata callbacks need query parameters, extract and supply them separately.

```js
const url = new URL(request.url);

const query = Object.create(null);

for (const [key, value] of url.searchParams) {
  query[key] = value;
}

const result = await resolveHead({
  routes,
  pathname: url.pathname,
  query,
  signal: request.signal,
});
```

This example keeps the last value when a query key occurs multiple times, consistent with the router's query-object representation. The query string is not inferred from `pathname`.

### Deployment base paths

If the application is deployed under `/app`, configure the base path:

```js
const result = await resolveHead({
  routes,
  pathname: "/app/products/42",
  base: "/app",
});
```

Route definitions remain application-relative. The matcher removes the configured base from the incoming pathname before matching it. A request outside that base does not match a route under it.

## A complete request handler

The following example uses a standard `Request` and `Response` interface and an HTML shell containing a dedicated head insertion point.

```js
import { resolveHead } from "udodi-router/server";

const shell = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <!-- UDODI_HEAD -->
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/app.js"></script>
  </body>
</html>`;

export async function handleRequest(request) {
  const url = new URL(request.url);
  const query = Object.create(null);

  for (const [key, value] of url.searchParams) {
    query[key] = value;
  }

  try {
    const { match, head } = await resolveHead({
      routes,
      pathname: url.pathname,
      query,
      signal: request.signal,
      defaults: {
        title: "Example Application",
        openGraph: {
          siteName: "Example Application",
        },
      },
    });

    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const status = match.record.path === "*" ? 404 : 200;
    const html = shell.replace("<!-- UDODI_HEAD -->", head);

    return new Response(html, {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Unable to resolve route metadata:", error);

    return new Response("Internal server error", {
      status: 500,
    });
  }
}
```

This example demonstrates head generation, not full component rendering. The response body still contains the application shell. If you also need server-rendered page content, implement that separately and insert it into the document shell.

The example uses the Web `Request` and `Response` APIs, which are available in modern Node.js and many edge runtimes. The shell can instead come from a template file or static asset.

## Using the lower-level APIs

Use the lower-level exports when your server needs to control matching, data loading, metadata resolution, or HTML generation independently.

### Match a route

Use `matchRoutes()` when you need the match result without running loaders or resolving metadata.

```js
import { matchRoutes } from "udodi-router/server";

const match = matchRoutes(routes, "/products/42");

if (match) {
  console.log(match.path);
  console.log(match.params);
  console.log(match.record);
  console.log(match.matched);
}
```

The match result contains:

- `path`: normalized application-relative pathname.
- `params`: decoded route parameters.
- `record`: the selected leaf route record.
- `matched`: the complete matched chain from parent to child.

The matcher is pure: it does not access the DOM or browser history, run guards, execute loaders, or resolve metadata.

### Reuse a compiled matcher

`matchRoutes()` creates a matcher for each call. For servers that repeatedly match requests against the same route table, compile it once with `createMatcher()`.

```js
import { createMatcher } from "udodi-router/server";

const matchRequestPath = createMatcher(routes);

export function findRoute(pathname) {
  return matchRequestPath(pathname);
}
```

For an application deployed under a base path, provide it during compilation:

```js
const matchRequestPath = createMatcher(routes, {
  base: "/app",
});

const match = matchRequestPath("/app/products/42");
```

A compiled matcher can then be reused for multiple requests. Recreate it if the route definitions or matcher configuration changes.

### Resolve metadata

Use `resolveMetadata()` when you already have a matched chain or when your own server pipeline is responsible for running loaders.

```js
import {
  matchRoutes,
  resolveMetadata,
} from "udodi-router/server";

const match = matchRoutes(routes, "/products/42");

if (match) {
  const metadata = await resolveMetadata({
    matched: match.matched,
    params: match.params,
    defaults: {
      title: "Example Store",
    },
    context: {
      siteName: "Example Store",
    },
  });
}
```

The `matched` records must be supplied in parent-to-child order. Metadata callbacks can be asynchronous and receive context, route parameters, loader data, and the corresponding route record.

#### Supplying loader data

`resolveMetadata()` accepts loader results through `loaderData`. A `Map` keyed by route-record objects is the preferred form:

```js
const loaderData = new Map();

loaderData.set(productRoute, {
  name: "Example Product",
  description: "A product description.",
});

const metadata = await resolveMetadata({
  matched: match.matched,
  params: match.params,
  loaderData,
  defaults: {
    title: "Example Store",
  },
});
```

A plain object keyed by the route records' `path` values is also supported. The `Map` form is safer when your application works with route records directly.

Metadata inheritance follows the matched parent chain. Omitted values inherit, `null` clears a value or supported section, and metadata from unrelated previously visited routes is not carried over.

For the complete metadata model and merge rules, see [Metadata](./metadata.md).

### Render metadata as HTML

Use `renderMetadata()` when you want to control how metadata is resolved but still want the router to produce the HTML head markup.

```js
import {
  resolveMetadata,
  renderMetadata,
} from "udodi-router/server";

const metadata = await resolveMetadata({
  matched: match.matched,
  params: match.params,
  loaderData,
  defaults,
});

const head = renderMetadata(metadata);
```

By default, `renderMetadata()` normalizes semantic metadata before rendering it. It returns an HTML string containing applicable elements such as:

- The document `<title>`.
- Standard and social-sharing meta tags.
- Canonical, icon, and custom link elements.
- JSON-LD structured-data script elements.

Values are escaped for their respective HTML contexts, and JSON-LD is encoded to prevent a `</script>` sequence from prematurely closing its script element.

The function does not access the document or execute scripts on the server.

#### Rendering configured scripts

Configured `meta.scripts` entries are excluded from rendered output by default. Enable them explicitly when your trusted server-rendering policy requires script tags:

```js
const head = renderMetadata(metadata, {
  includeScripts: true,
});
```

For `resolveHead()`, the equivalent option is `includeScripts: true`.

Enabling this option emits script elements; it does not execute them in the server runtime. Browsers may execute executable script elements when they process the returned HTML.

The `normalize` option on `renderMetadata()` defaults to `true`. Set it to `false` only when supplying an already-normalized metadata object in the shape expected by the renderer.

## Running loaders on the server

When `resolveHead()` runs loaders, it invokes them sequentially in parent-to-child order. Each loader receives the same general arguments as in client navigation:

```js
{
  params,
  query,
  signal,
  context,
}
```

The helper passes the request's abort signal when provided. Loaders that use abort-aware operations, such as `fetch()`, can use that signal to stop work when the request is cancelled.

A loader result is stored against the corresponding route record. The resulting data is available to metadata callbacks through `data`.

Server-side loaders execute in your server environment. They can access server-side services through `context`; do not expose credentials, private tokens, or other secrets in metadata that will be sent to the client.

### Reuse externally loaded data

If another server pipeline has already produced the loader results, set `runLoaders: false` and pass the results through `loaderData`:

```js
const { match, metadata, head } = await resolveHead({
  routes,
  pathname: "/products/42",
  runLoaders: false,
  loaderData,
});
```

When `runLoaders` is `false`, `resolveHead()` does not execute the route loaders. It uses the supplied `Map` if one is provided, otherwise it starts with an empty loader-data map.

Ensure that the supplied data corresponds to the same matched route records and request parameters. Otherwise, dynamic metadata could be resolved using incomplete or unrelated data.

## SEO without full server-side rendering

Udodi Router lets you place resolved titles, descriptions, canonical links, social-sharing tags, and structured data into the initial HTML response without rendering the component tree on the server.

This is useful for sites where the browser handles the interactive application, but the initial document still needs meaningful metadata.

The server API does not:

- Render Udodi components into HTML.
- Run client navigation guards.
- Resolve lazy components for browser rendering.
- Hydrate an application.
- Replace application-specific server authorization or response-status logic.

Your handler remains responsible for choosing HTTP status codes, handling errors, deciding which routes are accessible, and returning the appropriate document.

## Security considerations

Treat route configuration and metadata as application-controlled input.

- Prefer trusted route definitions and validate dynamic metadata values.
- Do not place secrets or private loader data in the document head.
- Keep `includeScripts` disabled unless you have a clear reason to emit script tags in the server-generated head.
- Use a Content Security Policy appropriate to the scripts your application serves.
- Continue enforcing authorization in server handlers and data services. A route match is not an access-control decision.

`renderMetadata()` escapes values when generating HTML, but that does not make arbitrary scripts or untrusted URLs safe to execute or load.
