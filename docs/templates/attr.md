# `@attr`

The `@attr` directive binds one or more HTML attributes to reactive template expressions.

Use it when an attribute value depends on component state. For fixed values, use ordinary HTML attributes.

`@attr` works at the **attribute level**: values are written with `setAttribute()` and removed with `removeAttribute()`. It does not assign DOM properties such as `element.disabled` or `element.value`.

---

## Basic Usage

```html
<a @attr="href=url title=tooltip">
  Documentation
</a>
```

Each binding has the form:

```text
attribute=expression
```

Multiple bindings are separated by whitespace:

```html
<a @attr="href=url title=tooltip target=target rel=rel">
  Open
</a>
```

The expression is evaluated against the component context.

```js
state() {
  return {
    url: "/docs",
    tooltip: "Documentation",
    target: "_blank",
    rel: "noopener",
  };
}
```

Each binding is evaluated as part of the same reactive effect.

---

## Example

```js
import { createComponent, html, render } from "udodi";

const DocLink = createComponent({
  name: "DocLink",

  state() {
    return {
      href: "https://example.com",
      label: "Open docs",
    };
  },

  template: () => html`
    <a
      @attr="href=href title=label"
      @text="label"
    ></a>
  `,
});

render(DocLink(), "#app");
```

When `href` or `label` changes, the corresponding HTML attribute is updated automatically.

---

## Binding Values

Each binding produces a value for its target attribute.

| Result       | Behavior                                   |
| ------------ | ------------------------------------------ |
| `null`       | Contributes no attribute                   |
| `undefined`  | Contributes no attribute                   |
| `""`         | Contributes no attribute                   |
| Other values | Converted with `String(value)` and applied |

For example:

```html
<img @attr="src=imageUrl alt=imageAlt" />

<button @attr="aria-label=label">
  Save
</button>
```

```js
state() {
  return {
    imageUrl: "/hero.png",
    imageAlt: "Hero",
    label: "Save",
  };
}
```

A numeric value is stringified:

```js
state() {
  return {
    tabIndex: 2,
  };
}
```

```html
<div @attr="tabindex=tabIndex"></div>
```

The resulting attribute is:

```html
<div tabindex="2"></div>
```

---

## Boolean Attributes

`@attr` uses `setAttribute()` and therefore does **not** interpret JavaScript booleans as HTML boolean-attribute presence.

For example:

```html
<button @attr="disabled=isDisabled">
  Save
</button>
```

If `isDisabled` is `false`, the value is stringified to `"false"`:

```html
<button disabled="false">
  Save
</button>
```

The `disabled` attribute is therefore still present and the button remains disabled.

For boolean attributes that should only be present when a condition is truthy, use the Template DSL conditional form:

```html
<<button @attr="isDisabled=>'disabled'">
  Save
</button>
```

When `isDisabled` is truthy:

```html
<button disabled="disabled">
  Save
</button>
```

When it is falsy, the dynamic `disabled` attribute is removed.

See [Template DSL](./dsl.md) for supported conditional expressions.

---

## Static Attribute Values

A standalone quoted string is **not** a valid `@attr` directive:

```html
<!-- Invalid -->
<div @attr="'title=Hello'"></div>
```

`@attr` expects one or more `attribute=expression` bindings.

A literal attribute value can be quoted on the right-hand side:

```html
<div @attr="title='Hello'"></div>
```

Or use component state:

```html
<div @attr="title=title"></div>
```

```js
state() {
  return {
    title: "Hello",
  };
}
```

---

## Base Attributes

Attributes already present on the element before `@attr` is processed are treated as **base attributes**.

The directive ignores other `@...` attributes when capturing this base set.

```html
<a
  href="/fallback"
  title="Default"
  @attr="href=url title=tooltip"
>
  Link
</a>
```

If `url` or `tooltip` produces a value, `@attr` temporarily owns that attribute.

If a binding later produces `null`, `undefined`, or `""`:

* the original base value is restored when one exists;
* otherwise the attribute is removed.

For example, if `url` becomes `null`, the element returns to:

```html
<a href="/fallback" title="Default">
  Link
</a>
```

This allows reactive attributes to temporarily override normal HTML attributes without permanently destroying their original values.

---

## Dynamic Ownership

`@attr` tracks the attributes produced by the directive separately from the element's original attributes.

Conceptually:

```text
HTML attributes
      │
      ├── base attributes
      │
      └── @attr managed attributes
                │
                ▼
         reactive evaluation
                │
                ▼
          attribute diff
```

Only attributes previously produced by `@attr` are considered for removal or restoration during subsequent evaluations.

This prevents unrelated attributes from being modified by the directive.

---

## Diffing

On every reactive evaluation, Udodi builds the next set of dynamic attributes and compares it with the previous set.

The process is:

1. Evaluate all `attribute=expression` bindings.
2. Ignore `null`, `undefined`, and empty-string results.
3. Convert remaining values to strings.
4. Merge bindings into the next attribute set.
5. Restore or remove attributes that are no longer produced.
6. Set attributes whose values changed.
7. Leave unchanged attributes untouched.

Conceptually:

```text
          previous attributes
                  │
                  ▼
          evaluate bindings
                  │
                  ▼
          string values
                  │
                  ▼
          compare with previous
        ┌──────────┴──────────┐
        ▼                     ▼
  restore / remove       set changed
```

This avoids unnecessary `setAttribute()` and `removeAttribute()` calls.

---

## Multiple Bindings

Multiple attributes can be declared in one `@attr` directive:

```html
<a
  @attr="
    href=url
    title=tooltip
    target=target
    rel=rel
  "
>
  Open
</a>
```

All bindings are compiled and evaluated together.

If the same attribute name appears more than once, the later binding wins:

```html
<div @attr="title=firstTitle title=secondTitle"></div>
```

The resulting `title` comes from `secondTitle`.

The merged result contains each target attribute only once.

---

## Reactive Attributes

Because dynamic `@attr` bindings run inside a reactive effect, dependencies are tracked automatically.

```html
<a @attr="href=url title=label">
  Link
</a>
```

If `url` changes, only `href` needs to be updated. If `label` changes, only `title` needs to be updated.

Unchanged attributes are left untouched.

This makes `@attr` suitable for state-dependent values such as:

* `href`
* `src`
* `alt`
* `title`
* `target`
* `rel`
* `aria-*`
* `data-*`
* custom attributes

---

## `@attr` vs Other Directives

| Need                      | Prefer                 |
| ------------------------- | ---------------------- |
| Arbitrary HTML attributes | `@attr`                |
| CSS class membership      | [`@class`](./class.md) |
| Inline CSS properties     | [`@style`](./style.md) |
| Form control values       | [`@bind`](./bind.md)   |
| Element references        | [`@ref`](./ref.md)     |

For example:

```html
<input
  @bind="email"
  @attr="aria-label=label"
  @class="invalid=>'is-invalid'"
  @style="inputStyle"
/>
```

Each directive owns a different part of the element's behavior.

---

## Attributes vs DOM Properties

`@attr` always manipulates HTML attributes:

```js
element.setAttribute(name, String(value));
```

and:

```js
element.removeAttribute(name);
```

It does not perform property assignment such as:

```js
element[name] = value;
```

This distinction matters for attributes that have reflected DOM properties or boolean semantics.

For example:

```html
<input @attr="value=value">
```

sets the HTML `value` attribute. It is not equivalent to:

```js
input.value = value;
```

For two-way form state, use [`@bind`](./bind.md).

---

## Example

```js
import { createComponent, html, render } from "udodi";

const Avatar = createComponent({
  name: "Avatar",

  state() {
    return {
      src: "/avatar.png",
      alt: "User avatar",
      profileUrl: "/profile",
    };
  },

  template: () => html`
    <a @attr="href=profileUrl">
      <img @attr="src=src alt=alt" />
    </a>
  `,
});

render(Avatar(), "#app");
```

The attributes remain synchronized with the component state:

```text
profileUrl  ──► href
src         ──► src
alt         ──► alt
```

Changing any of these state values updates only its corresponding attribute.

---

## Behavior

`@attr`:

* Accepts one or more `attribute=expression` bindings.
* Evaluates all bindings reactively.
* Accepts strings, numbers, booleans, and other values that can be stringified.
* Ignores `null`, `undefined`, and empty-string results.
* Converts other results with `String(value)`.
* Merges duplicate attribute targets with the later binding taking precedence.
* Records existing non-directive attributes as base attributes.
* Restores base attributes when dynamic ownership is removed.
* Removes dynamic attributes that have no base value.
* Diffs against the previous dynamic attribute set.
* Avoids rewriting unchanged attributes.
* Uses `setAttribute()` and `removeAttribute()` rather than DOM property assignment.
* Removes the `@attr` attribute after setup.
* Disposes its reactive effect with the component scope.

---

## Syntax Summary

| Form                           | Behavior                                             |
| ------------------------------ | ---------------------------------------------------- |
| `@attr="href=url"`             | Bind `href` to `url`                                 |
| `@attr="href=url title=label"` | Bind multiple attributes                             |
| `@attr="title='Hello'"`        | Bind a literal string                                |
| `null` / `undefined` / `""`    | Drop the dynamic attribute or restore its base value |
| Other values                   | Convert with `String(value)`                         |
| Duplicate target               | Later binding wins                                   |

---

## Constraints

| Rule               | Detail                                                        |
| ------------------ | ------------------------------------------------------------- |
| Binding form       | `attribute=expression`                                        |
| Standalone literal | Not valid as the entire directive value                       |
| Stringification    | Non-empty results are converted with `String(value)`          |
| Boolean values     | `false` becomes `"false"`; it does not remove the attribute   |
| Base attributes    | Restored when dynamic ownership ends                          |
| DOM properties     | Not assigned; use the appropriate property-oriented directive |
| Diffing            | Only changed dynamic attributes are written                   |
| Runtime attribute  | `@attr` is removed after binding                              |

---

## Minimal Example

```js
import { createComponent, html, render } from "udodi";

const Avatar = createComponent({
  name: "Avatar",

  state() {
    return {
      src: "/avatar.png",
      alt: "User",
    };
  },

  template: () => html`
    <img @attr="src=src alt=alt" />
  `,
});

render(Avatar(), "#app");
```

The `src` and `alt` attributes are kept synchronized with component state.

---

## Next Steps

* [`@class`](./class.md) — reactive CSS classes
* [`@style`](./style.md) — reactive inline styles
* [`@bind`](./bind.md) — two-way form bindings
* [`@ref`](./ref.md) — element references
* [Template DSL](./dsl.md) — binding and expression syntax
* [Template Overview](./overview.md) — template directive fundamentals
