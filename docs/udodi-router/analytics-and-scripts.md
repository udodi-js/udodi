---
title: Analytics and Scripts
description: Configure route-level scripts, script execution policies, and Google Analytics page-view reporting in Udodi Router.
---

# Analytics and Scripts

Udodi Router supports route-level script configuration and automatic Google Analytics page-view reporting. Scripts are declared through route metadata, allowing applications to configure shared scripts at a parent route and page-specific behavior on individual routes.

The router manages script elements and their execution policies. It does not initialize an analytics provider automatically, except for reporting page views when Google Analytics' `gtag` function is available.

## Configuring scripts

Define scripts in the `scripts` array of a route's `meta` object.

```js
{
  path: "/dashboard",
  component: Dashboard,
  meta: {
    scripts: [
      {
        src: "https://example.com/widget.js",
        async: true,
        once: true,
      },
    ],
  },
}
```

A script descriptor must provide exactly one of these properties:

| Property | Description |
| --- | --- |
| `src` | Non-empty URL for an external script. |
| `content` | Inline script content as a string. |

Providing neither, or providing both, makes the descriptor invalid and it is ignored during normalization.

### External scripts

Use `src` to load an external JavaScript file.

```js
meta: {
  scripts: [
    {
      src: "https://example.com/widget.js",
      type: "text/javascript",
      async: true,
      defer: true,
      once: true,
    },
  ],
}
```

Supported script attributes include:

| Property | Type | Purpose |
| --- | --- | --- |
| `src` | `string` | External script URL. |
| `content` | `string` | Inline script source. |
| `type` | `string` | Script MIME type or module type, such as `module`. |
| `key` | `string` | Explicit script identity. |
| `async` | `boolean` | Sets the script's `async` attribute. |
| `defer` | `boolean` | Sets the script's `defer` attribute. |
| `crossOrigin` | `string` | Sets the cross-origin attribute. |
| `integrity` | `string` | Sets the subresource integrity attribute. |
| `referrerPolicy` | `string` | Sets the referrer policy. |
| `once` | `boolean` | Controls whether the script is installed once or reinserted on route entry. |

Use `integrity` when the external resource provides a suitable Subresource Integrity hash. Its presence alone does not guarantee that the resource is safe.

### Inline scripts

Use `content` when a trusted application integration requires inline JavaScript.

```js
meta: {
  scripts: [
    {
      key: "widget-config",
      content: `
        window.widgetConfig = {
          theme: "light",
        };
      `,
      once: true,
    },
  ],
}
```

The router assigns the content to a script element before inserting it into the document head.

Inline scripts must comply with your site's Content Security Policy. Udodi Router does not bypass CSP restrictions.

## Script identity

The router uses an identity to determine whether a script has already been installed.

By default, identity is derived from the script's type and source URL or inline content. You can override this with an explicit `key`.

```js
meta: {
  scripts: [
    {
      key: "analytics-bootstrap",
      content: `
        window.dataLayer = window.dataLayer || [];
      `,
      once: true,
    },
  ],
}
```

An explicit `key` is a global script identity rather than a route name. Use unique keys when the same script source must intentionally be installed more than once with different configurations.

The router also deduplicates equivalent normalized script descriptors within the resolved metadata.

## Choosing an execution policy

The `once` property controls how the router installs a script.

### `once: true`

This is the default. The script is installed once per document and script identity. When a later navigation encounters the same identity, the router skips installation.

```js
{
  src: "https://www.googletagmanager.com/gtag/js?id=G-XXXX",
  async: true,
  once: true,
}
```

Use this policy for bootstrap scripts, shared analytics libraries, and integrations that should be initialized once per document.

The registry is shared by head managers using the same document. Removing a script element externally does not clear its registered identity, and returning to a route will not automatically reinstall that identity.

### `once: false`

Set `once: false` when the script element should be removed and reinserted when its route is entered again.

```js
{
  key: "route-widget",
  src: "https://example.com/route-widget.js",
  once: false,
}
```

This policy requires a route identity. Udodi Router supplies the `routeKey` internally from the committed pathname, so application code does not need to pass it to `createRouter()` or include it in each script descriptor.

The route key is pathname-based. Query strings and hashes do not create separate route-key slots.

On a subsequent application of the same script identity for that pathname, the router replaces the previous script element and inserts a new one.

Use this policy only when reinserting the script is appropriate for the integration.

**Removing a script element does not undo JavaScript that has already executed.** Global event listeners, timers, modified application state, and other side effects can survive node removal. Prefer `once: true` for scripts that initialize long-lived services.

## Script inheritance

Scripts participate in route metadata inheritance. Scripts declared by a parent route are included in the resolved metadata for its matched descendants unless the inherited collection is explicitly cleared.

Script collections accumulate through the matched parent chain. Equivalent descriptors are deduplicated during normalization, while distinct script identities can coexist.

For the metadata merge rules and `null` behavior, see [Metadata](./metadata.md).

## Google Analytics page views

When Google Analytics' `gtag` function is initialized, Udodi Router reports a `page_view` event after a successful route commit.

The event includes:

- `page_title`: The resolved metadata title, falling back to `document.title`.
- `page_location`: The committed URL as an absolute URL.
- `page_path`: The pathname, query string, and hash.

The router does not load or initialize Google Analytics automatically. Configure its external library and bootstrap code as trusted route metadata, or initialize it through your application's shell.

### Configure the Google Analytics bootstrap

For a single-page application, disable the automatic page view sent by the Google Analytics `config` command so that the router can report page views consistently without duplicating the initial view.

```js
const routes = [
  {
    path: "/",
    component: Home,
    meta: {
      scripts: [
        {
          key: "gtag-library",
          src: "https://www.googletagmanager.com/gtag/js?id=G-XXXX",
          async: true,
          once: true,
        },
        {
          key: "gtag-bootstrap",
          content: `
            window.dataLayer = window.dataLayer || [];
            function gtag() {
              dataLayer.push(arguments);
            }

            gtag("js", new Date());
            gtag("config", "G-XXXX", {
              send_page_view: false,
            });
          `,
          once: true,
        },
      ],
    },
  },
];
```

Replace `G-XXXX` with your measurement ID. The library is loaded once, and the bootstrap disables its automatic initial page-view event. Udodi Router then reports page views after route commits when `gtag` is available and page-view reporting has not been disabled by metadata.

If your analytics provider is initialized elsewhere, keep that initialization in one place and avoid configuring multiple mechanisms to report the same navigation.

### Disable page-view reporting

Use `analytics.pageView: false` when a route should not automatically report a Google Analytics page view.

```js
{
  path: "/privacy",
  component: Privacy,
  meta: {
    title: "Privacy",
    analytics: {
      pageView: false,
    },
  },
}
```

You can also disable reporting for a whole matched section through its parent route's metadata. Child routes inherit the setting unless they override it.

The router also supports `analytics: false` to disable reporting for the resolved route metadata.

The `analytics` section is configuration data. It does not create an analytics account, load a provider, or replace the provider's own configuration.

## Prevent duplicate analytics events

Duplicate page views can happen when both the analytics provider and the router independently report navigation.

For Google Analytics, a typical single-page application should:

1. Load and initialize `gtag` once.
2. Configure `gtag` with `send_page_view: false` when using the router's automatic page-view reporting.
3. Let Udodi Router report `page_view` events after successful route commits.
4. Avoid adding a second independent page-view handler for the same navigation.

A provider can also send events through its own tracking mechanism. Verify the provider's configuration before combining automatic tracking, manual page views, and router-managed reporting.

## Trust and security

Treat route script metadata as trusted application configuration.

External and inline scripts execute in the page's security context. Do not construct executable script descriptors from user-controlled values, untrusted API responses, or arbitrary URL parameters.

When configuring third-party scripts, review their origin, permissions, integrity options where applicable, and compatibility with your Content Security Policy.

The router manages insertion and element identity; it does not sandbox scripts or reverse their runtime side effects.
