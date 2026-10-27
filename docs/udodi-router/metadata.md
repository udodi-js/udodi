---
title: Metadata
description: Configure page titles, descriptions, canonical URLs, Open Graph, Twitter cards, structured data, and custom head tags in Udodi Router.
---

# Metadata

Udodi Router lets you describe document metadata using plain JavaScript objects attached to route records. It resolves metadata for the active route, including inherited values from parent routes and router-level defaults, and applies the result to the document head after successful navigation.

Metadata can be static or computed asynchronously from route parameters and loader data. You do not need a separate metadata management library for ordinary client-side applications.

## Defining route metadata

Use the `meta` property on a route record.

```js
const routes = [
  {
    path: "/about",
    component: About,
    meta: {
      title: "About Us",
      description: "Learn about our application.",
      canonical: "https://example.com/about",
      keywords: ["about", "company", "application"],
      author: "Example",
      icon: "/favicon.svg",
    },
  },
];
```

The router resolves these values and translates them into the appropriate document-head descriptors, such as the document title, meta tags, canonical link, and icons.

The `meta` property accepts either a metadata object or a function that returns one.

## Supported metadata fields

| Field | Accepted value | Purpose |
| --- | --- | --- |
| `title` | `string` or `null` | Document title. |
| `description` | `string` or `null` | Page description. |
| `keywords` | `string`, `string[]`, or `null` | Page keywords. Arrays are normalized into a comma-separated string. |
| `author` | `string` or `null` | Document author. |
| `canonical` | `string` or `null` | Canonical URL, emitted as a canonical link. |
| `icon` | `string`, object, array, or `null` | Document icon or icons. |
| `openGraph` | Object or `null` | Open Graph metadata for social sharing. |
| `twitter` | Object or `null` | Twitter card metadata. |
| `structuredData` | Object, array, or `null` | Structured data emitted as JSON-LD. |
| `custom` | Object or `null` | Custom meta tags and link elements. |

Udodi Router also accepts `scripts` and `analytics` metadata fields. Their execution policies and configuration are covered separately in [Analytics and Scripts](./analytics-and-scripts.md).

## Static metadata

Static metadata is appropriate when a page's information is known when the route is defined.

```js
const routes = [
  {
    path: "/",
    component: Home,
    meta: {
      title: "Home",
      description: "Welcome to our application.",
      canonical: "https://example.com/",
      openGraph: {
        type: "website",
        siteName: "Example",
        title: "Home",
        description: "Welcome to our application.",
        image: "https://example.com/images/home.png",
      },
    },
  },
];
```

You can define only the properties a page needs. Other values can come from router-level defaults or parent routes.

## Dynamic metadata

Use a metadata callback when values depend on the destination, loader data, or application context.

```js
{
  path: "/posts/:id",
  component: Post,

  loader: async ({ params, signal }) => {
    const response = await fetch(
      `/api/posts/${encodeURIComponent(params.id)}`,
      { signal },
    );

    if (!response.ok) {
      throw new Error("Unable to load post.");
    }

    return response.json();
  },

  meta: ({ params, data }) => ({
    title: data?.title ?? `Post ${params.id}`,
    description: data?.excerpt ?? "Read this post.",
    canonical: `https://example.com/posts/${params.id}`,
    openGraph: {
      type: "article",
      title: data?.title ?? `Post ${params.id}`,
      description: data?.excerpt ?? "Read this post.",
      image: data?.coverUrl,
    },
  }),
}
```

A metadata callback can be asynchronous:

```js
{
  path: "/products/:id",
  component: Product,

  meta: async ({ params, context }) => {
    const product = await context.products.getById(params.id);

    return {
      title: product.name,
      description: product.description,
    };
  },
}
```

Metadata callbacks receive a context object containing the shared router context, any record-specific context, and route information such as `params`, `data`, and `route`. Record-specific values take precedence over corresponding shared context values.

For a matched route record, `data` represents the loader result associated with that record when available. This allows metadata to use the same data prepared for the page.

The router resolves metadata after route loaders and lazy component preparation. If navigation fails before commit, the destination's metadata is not committed.

See [Guards and Loaders](./guards-and-loaders.md) for loader execution and error behavior.

## Router-level defaults

Use the router's `meta` option to define metadata shared across the application.

```js
const router = createRouter({
  routes,

  meta: {
    title: "Example Application",
    author: "Example",
    openGraph: {
      siteName: "Example",
      type: "website",
    },
    twitter: {
      card: "summary",
      site: "@example",
    },
  },
});
```

Router-level defaults are resolved first. Metadata from matched routes is then merged in parent-to-child order.

This keeps application-wide values in one place while allowing individual pages to provide their own titles, descriptions, canonical URLs, and social-sharing information.

## Metadata inheritance

Udodi Router combines router defaults with the metadata of matched route records. Parent values are inherited by children unless a child overrides or clears them.

### Omitted properties inherit

A child route inherits a parent's metadata when the child omits that property.

```js
const routes = [
  {
    path: "/docs",
    component: DocsLayout,
    meta: {
      author: "Example",
      openGraph: {
        siteName: "Example Docs",
        type: "website",
      },
    },

    children: [
      {
        path: "installation",
        component: Installation,
        meta: {
          title: "Installation",
        },
      },
    ],
  },
];
```

The installation page inherits the parent's author and Open Graph site name while providing its own title.

### Child values override parent values

For ordinary fields, a child value replaces the inherited value.

```js
{
  path: "/docs",
  component: DocsLayout,
  meta: {
    title: "Documentation",
  },
  children: [
    {
      path: "installation",
      component: Installation,
      meta: {
        title: "Installation",
      },
    },
  ],
}
```

When `/docs/installation` is active, the document title is `Installation`.

### Nested sections merge

The `openGraph`, `twitter`, and `analytics` sections merge recursively. A child can override one field without discarding unrelated fields inherited from its parent.

```js
{
  path: "/docs",
  component: DocsLayout,
  meta: {
    openGraph: {
      siteName: "Example Docs",
      type: "website",
    },
  },
  children: [
    {
      path: "installation",
      component: Installation,
      meta: {
        openGraph: {
          title: "Installation",
        },
      },
    },
  ],
}
```

The resulting Open Graph metadata retains `siteName` and `type` while using `Installation` as the title.

The `custom` section is merged by its keys. When both parent and child provide arrays under the same custom key, those arrays are concatenated.

### `null` clears inherited values

Set a property or supported metadata section to `null` when you need to clear an inherited value.

```js
{
  path: "/internal",
  component: InternalPage,
  meta: {
    description: null,
    openGraph: null,
  },
}
```

Here, the child explicitly clears the inherited description and Open Graph section instead of inheriting them.

For `scripts` and `structuredData`, `null` clears the inherited collection. Otherwise, their values accumulate across the matched parent chain.

### Metadata does not leak between pages

Inheritance follows the current matched route chain and router defaults. Metadata from a previously visited page is not carried over simply because the next page omits a property.

For example, navigating from `/products/42` to `/about` does not cause the product page's title or Open Graph image to persist unless those values are also provided by defaults or the About route's matched ancestors.

## Open Graph metadata

The `openGraph` object defines metadata commonly used when a page is shared on social platforms that consume Open Graph tags.

| Property | Purpose |
| --- | --- |
| `type` | Content type, such as `website` or `article`. |
| `siteName` | Name of the website or application. |
| `locale` | Content locale, such as `en_US`. |
| `title` | Social-sharing title. Falls back to the resolved page title when omitted. |
| `description` | Social-sharing description. Falls back to the resolved description when omitted. |
| `url` | Open Graph URL. Falls back to the canonical URL when omitted. |
| `image` | Image URL or image descriptor object. |

The `image` value can be a URL string or an object:

```js
meta: {
  openGraph: {
    type: "article",
    title: "Understanding Routing",
    image: {
      url: "https://example.com/images/routing.png",
      width: 1200,
      height: 630,
      alt: "An illustration of application routing",
    },
  },
}
```

For an image object, `url` is required. Positive numeric `width` and `height` values and a string `alt` value are retained when provided.

Udodi Router normalizes these values into Open Graph meta-tag descriptors, including `og:image`, `og:image:width`, `og:image:height`, and `og:image:alt`.

## Twitter card metadata

Use the `twitter` object to describe how the page should appear in a Twitter card.

```js
meta: {
  title: "Understanding Routing",
  description: "A guide to application routing.",

  twitter: {
    card: "summary_large_image",
    site: "@example",
    creator: "@author",
    title: "Understanding Routing",
    description: "A guide to application routing.",
    image: {
      url: "https://example.com/images/routing.png",
      alt: "An illustration of application routing",
    },
    imageAlt: "An illustration of application routing",
  },
}
```

Supported fields include `card`, `site`, `creator`, `title`, `description`, `image`, and `imageAlt`.

When the Twitter title or description is omitted, the resolved page title or description is used. An image can be supplied as a string URL or as an object containing a `url` and optional image information.

Use the social metadata that is appropriate for the page. Udodi Router normalizes Open Graph and Twitter values into their respective meta-tag formats.

## Icons

The `icon` field accepts a URL string, an icon descriptor, or an array of either.

A string is normalized into an icon link:

```js
meta: {
  icon: "/favicon.svg",
}
```

For more control, supply an object with `href` or `url`:

```js
meta: {
  icon: [
    {
      rel: "icon",
      href: "/favicon.svg",
      type: "image/svg+xml",
    },
    {
      rel: "apple-touch-icon",
      href: "/apple-touch-icon.png",
      sizes: "180x180",
    },
  ],
}
```

Supported descriptor properties include `type`, `sizes`, `media`, and `rel`. The router normalizes icons into link descriptors that can be applied to the document head.

## Structured data

Use `structuredData` to provide JSON-LD objects.

```js
meta: {
  structuredData: {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Understanding Routing",
    author: {
      "@type": "Person",
      name: "Example Author",
    },
  },
}
```

A single object or an array of objects is accepted. Structured data accumulates through metadata inheritance rather than being replaced by each child route.

During normalization, equivalent JSON-LD objects are deduplicated. Objects with an `@id` are deduplicated by that identifier; objects without one are compared using their serialized content.

Ensure that your structured data accurately represents the actual page content and follows the schema expected by the consuming search engines or other clients.

## Custom meta tags and links

Use `custom` when the built-in fields do not cover a required meta tag or link element.

### Custom meta tags

Each custom meta descriptor must contain `content` and exactly one of `name` or `property`.

```js
meta: {
  custom: {
    meta: [
      {
        name: "theme-color",
        content: "#ffffff",
      },
      {
        property: "article:section",
        content: "Engineering",
      },
    ],
  },
}
```

Use `name` for named metadata and `property` for property-based metadata such as custom Open Graph-compatible fields.

### Custom links

Each custom link descriptor requires `rel` and `href`.

```js
meta: {
  custom: {
    links: [
      {
        rel: "alternate",
        type: "application/rss+xml",
        href: "/feed.xml",
        title: "RSS",
      },
      {
        rel: "alternate",
        hreflang: "fr",
        href: "https://example.com/fr/docs",
      },
    ],
  },
}
```

Optional link properties include `type`, `hreflang`, `media`, `sizes`, and `title`.

Custom meta tags and links can be inherited from parent routes. The normalization step removes duplicate custom tags by metadata name or property and duplicate links by their relation and destination.

## Normalization and client-side application

Before metadata is applied, Udodi Router normalizes semantic fields into stable descriptors for document-head elements.

The normalized representation includes:

- `title`, `description`, `keywords`, `author`, and `canonical`
- `icons`, `metaTags`, and `links`
- `jsonLd` for structured data
- `scripts` and `analytics` descriptors
- `custom` metadata and link collections

The metadata module itself is browser-independent: it does not access `document`, create elements, or execute scripts. The client-side head manager is responsible for applying resolved descriptors to the document.

For an ordinary client-side application, define `meta` on your routes and optionally provide router-level defaults. You do not need to call metadata resolution functions manually.

For server-side generation, see [Server-Side SEO](./server-side-seo.md). That guide covers the `udodi-router/server` helpers and producing HTML head markup without browser code.
