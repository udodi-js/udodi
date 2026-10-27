---
title: Links and Outlets
description: Build navigation links and nested route outlets with Udodi Router.
---

# Links and Outlets

Udodi Router provides two component factories for rendering navigation and route views:

- `router.Link()` creates a navigation component using your own Udodi template.
- `router.RouterView()` renders the component associated with the active route at that outlet's depth.

Both integrate with Udodi's existing component and template system. You control the markup; the router manages navigation and route-view selection.

## Navigation with `router.Link()`

`router.Link(props, template)` creates a navigation component from a destination and a template.

```js
${router.Link({ to: "/dashboard" }, html`
  <a class="nav-link">Dashboard</a>
`)}
```

The `to` property is required, and the template is required. The template determines the element, attributes, content, and styling.

### Link options

| Option | Description |
| --- | --- |
| `to` | Required string or object navigation target. |
| `exact` | When `true`, the link is active only when its pathname exactly matches the committed pathname. Defaults to `false`. |

Additional properties supplied in the first argument are passed through to the link component's context, allowing your template to use application-specific values.

A button can also act as a navigation control:

```js
${router.Link({ to: "/logout" }, html`
  <button type="button" class="btn">Sign out</button>
`)}
```

Use `type="button"` for navigation buttons placed inside forms when you do not intend them to submit the form.

## Let the router manage `href`

When the template's root element is an anchor, Udodi Router sets its `href` from the `to` destination. A supplied `href` is deliberately overridden.

```js
${router.Link({ to: "/reports" }, html`
  <a class="nav-link">Reports</a>
`)}
```

This keeps the link's browser-visible destination aligned with the router's navigation target. Do not manually duplicate the destination in an `href` attribute.

For ordinary, unmodified left-clicks, the router intercepts navigation and calls `router.push()`. Standard anchor behavior is preserved for modified clicks, downloads, links targeting a browsing context other than `_self`, and anchors marked with `rel="external"`.

When your template uses a non-anchor element, the router still handles eligible clicks but does not assign an `href`. Prefer an anchor when you want the normal browser semantics of a link.

For programmatic navigation and object targets, see [Navigation](./navigation.md).

## Active links

The link template exposes a computed `isActive` value. Use it to toggle classes or other UI attributes without manually subscribing to route changes.

```js
const App = createComponent({
  name: "App",

  template: html`
    <nav>
      ${router.Link({ to: "/dashboard", exact: true }, html`
        <a @class="isActive=>'active' 'nav-link'">Overview</a>
      `)}

      ${router.Link({ to: "/dashboard/settings" }, html`
        <a @class="isActive=>'active' 'nav-link'">Settings</a>
      `)}
    </nav>

    ${router.RouterView()}
  `,
});
```

The `@class` directive uses `isActive` to choose the active or inactive class.

### Prefix and exact matching

By default, active matching uses the compiled matched-route hierarchy. A parent route can remain active while one of its child routes is displayed.

| Link option | Behavior |
| --- | --- |
| `{ to: "/dashboard" }` | Active when `/dashboard` is in the committed matched hierarchy, including when a matched child is active. |
| `{ to: "/dashboard", exact: true }` | Active only when the committed pathname is exactly `/dashboard` after normalization. |

The query string and hash do not affect active-link matching.

Use `exact: true` for an index or overview link when it should not remain active on nested pages.

The `isActive` value responds reactively when the committed route changes. You do not need an additional effect merely to track active-link state.

For direct access to the route object and `router.isActive()`, see [Route State](./route-state.md).

## Object targets

A link can accept an object target when its path, query, or hash should be constructed separately.

```js
${router.Link({
  to: {
    path: "/search",
    query: { q: "udodi", page: 2 },
    hash: "results",
  },
}, html`
  <a class="nav-link">Search results</a>
`)}
```

The router generates the anchor's `href` from the target. Query parameters and hashes are included in the destination, but active matching uses only the pathname.

For supported target properties and query serialization rules, see [Navigation](./navigation.md).

## Rendering route views with `router.RouterView()`

`router.RouterView()` creates an outlet for the active route component. Place it where the routed content should appear in your application's template.

```js
const App = createComponent({
  name: "App",

  template: html`
    <header>
      <h1>My Application</h1>
    </header>

    <main>
      ${router.RouterView()}
    </main>
  `,
});
```

The root outlet renders the first component in the matched route chain. If that component contains another `router.RouterView()`, the nested outlet renders the next matched component.

### Nested outlet depth

Udodi Router determines outlet depth from the enclosing route-view host:

- The application-level outlet has depth `0`.
- An outlet inside the component rendered at depth `0` has depth `1`.
- Each further nested outlet advances one level.

```text
Application
└── RouterView (depth 0)
    └── DashboardLayout
        ├── Shared navigation
        └── RouterView (depth 1)
            └── DashboardSettings
```

When `/dashboard/settings` is active, the root outlet renders `DashboardLayout` and the nested outlet renders `DashboardSettings`.

A parent layout remains mounted while its route record remains active at that depth. Its nested outlet manages the child view independently.

The route hierarchy and outlet placement must agree. An outlet cannot render a child component that is not present at its corresponding depth in the matched chain.

See [Nested Routes](./nested-routes.md) for parent-child configuration, index routes, and absolute child paths.

## Keeping route views alive

By default, an inactive route view is unmounted when navigation switches to a different route record. You can opt individual route records into keep-alive behavior with `keepAlive: true`.

```js
const routes = [
  {
    path: "/reports",
    component: Reports,
    keepAlive: true,
  },
  {
    path: "/settings",
    component: Settings,
  },
];

const router = createRouter({
  routes,
  maxKeepAlive: 10,
});
```

When the Reports view is deactivated, the router can retain its component instance and hide its host rather than unmounting it. Returning to the same route record can restore the retained view.

This is useful for pages with expensive setup or local UI state that should survive navigation.

### Configure the cache limit

The router-level `maxKeepAlive` option sets the maximum number of **inactive retained views per outlet**.

| Value | Behavior |
| --- | --- |
| `10` (default) | Retain up to ten inactive views per outlet. |
| A positive integer | Use the specified cache limit per outlet. |
| `0` | Disable route-view caching. |

Only route records with `keepAlive: true` opt into retention. The cache uses route-record identity, so navigating between parameter values handled by the same record reuses that view rather than creating a separate cached instance for every parameter value.

When the cache limit is exceeded, the least recently used retained view is evicted and unmounted. A lower cache limit reduces retained memory at the cost of recreating views more often.

Keep-alive is per outlet, not one shared cache across the whole router. Nested outlets manage their own retained views.

## Route-view lifecycle notifications

A retained view can define two optional methods in its Udodi component configuration:

- `onRouteDeactivate(route)` runs when its view is hidden and retained.
- `onRouteActivate(route)` runs when a retained view is restored.

These are router notifications, not replacements for Udodi's normal `onMount()` and `onUnmount()` hooks.

```js
const Reports = createComponent({
  name: "Reports",

  methods: {
    onRouteDeactivate(route) {
      // Pause route-specific activity while this view is inactive.
    },

    onRouteActivate(route) {
      // Resume route-specific activity when this view is restored.
    },
  },

  template: html`
    <section>
      <h1>Reports</h1>
    </section>
  `,
});
```

The `route` argument is the router's current committed route state at the time of the notification.

These methods have specific behavior:

- `onRouteDeactivate()` is called when a view is retained in the keep-alive cache.
- `onRouteActivate()` is called when a previously retained view is restored.
- They are not called as a pair for the initial mount.
- When a view is not retained, it is unmounted instead of receiving the keep-alive deactivation notification.

Use `onMount()` and `onUnmount()` for ordinary component resource setup and cleanup. Use the route-view notifications when behavior needs to pause or resume as the view moves into or out of the cache.
