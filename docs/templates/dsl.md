# Template DSL

Udodi templates use a small expression language for connecting markup to component data and behavior.

Directive values are parsed by the template expression runtime and evaluated against the component context. The DSL intentionally provides a limited syntax rather than exposing arbitrary JavaScript expressions.

Individual directives build on this shared expression syntax and may impose additional rules on the value they accept. For example, `@on` defines event-handler syntax, `@for` defines list-rendering syntax, and `@attr` accepts multiple attribute bindings.

---

## Where Expressions Appear

Directive attributes contain values that are interpreted according to the directive.

For example:

```html
<span @text="name"></span>

<button @on="click=save"></button>

<a @attr="href=url title=tooltip"></a>

<div @class="isActive=>'active' sizeClass"></div>
```

Some directives also support static values:

```html
<span @text="'Hello'"></span>

<div @class="'card elevated'"></div>

<div @style="'color:red;padding:8px'"></div>
```

The exact value format depends on the directive. See the individual directive guides for directive-specific syntax.

---

## Values and Literals

The expression language supports primitive literal values and references to values exposed by the component context.

### Strings

Strings may be written with single or double quotes:

```html
<span @text="'Hello'"></span>
<span @text='"Hello"'></span>
```

Quoted strings are useful when a directive needs a literal value rather than a context lookup.

### Numbers

Numeric literals can be used where a directive accepts them:

```html
<span @text="42"></span>
```

### Booleans

Boolean literals are written as `true` and `false`:

```html
<button @attr="disabled=true"></button>
```

Whether a literal is meaningful depends on the directive consuming the expression.

---

## Paths

A path reads a value from the component context.

Simple paths:

```text
name
count
items
```

Nested paths:

```text
user.name
user.profile.email
items.length
```

For example:

```html
<span @text="user.name"></span>
<input @bind="user.email" />
```

Roughly equivalent to:

```js
context.user.name
context.user.email
```

The first segment is resolved against the component context. Nested segments are then resolved from the resulting value.

Paths can therefore access values exposed by the component, such as state, computed values, props, and methods where the directive permits them.

See [Context](../fundamentals/context.md) for the values available to templates.

---

## Function Calls

Udodi uses colon syntax for function calls rather than JavaScript’s parenthesized call syntax.

```text
formatDate:createdAt
formatDate:createdAt:'MMM DD'
add:a:b
```

Roughly equivalent to:

```js
formatDate(createdAt)
formatDate(createdAt, 'MMM DD')
add(a, b)
```

The name before the first `:` identifies the function. Each subsequent `:` supplies an argument.

For example:

```html
<span @text="formatDate:createdAt:'yyyy-MM-dd'"></span>
```

Arguments can themselves be values supported by the expression syntax, such as paths or literals.

Do **not** write function calls using JavaScript syntax:

```text
formatDate(createdAt)   // incorrect in templates
```

Use:

```text
formatDate:createdAt
```

Function calls are primarily useful with component methods and template standard-library helpers.

---

## Pipelines

The pipe operator (`|`) passes the result of one expression into the next step.

```text
name | capitalise
value | trim | upper
createdAt | formatDate:'MMM DD'
```

Roughly equivalent to:

```js
capitalise(name)
upper(trim(value))
formatDate(createdAt, 'MMM DD')
```

For example:

```html
<p @text="userName | capitalise"></p>
```

The expression is evaluated from left to right. The result produced by one step becomes the input to the following step.

Pipelines are particularly useful for small formatting operations that do not justify a component method.

---

## Conditional Expressions

The `=>` syntax represents a conditional value:

```text
isActive => 'active'
```

Roughly equivalent to:

```js
isActive ? 'active' : undefined
```

When `isActive` is truthy, the expression contributes `'active'`. When it is falsy, it contributes no value.

This form is particularly useful with `@class`:

```html
<div @class="isActive=>'active'"></div>
```

Multiple conditional and ordinary expressions can be combined where the directive supports them:

```html
<div @class="isActive=>'active' sizeClass"></div>
```

Here:

- `isActive=>'active'` conditionally contributes the `active` class  
- `sizeClass` resolves a class value from the component context  

Conditional syntax is directive-dependent. It is most commonly used for class composition.

---

## Bindings

Some directives accept multiple named bindings using `=`:

```text
name=expression
```

For example:

```html
<a @attr="href=url title=tooltip"></a>
```

This defines two attribute bindings:

- `href` → `url`  
- `title` → `tooltip`  

Roughly equivalent to:

```js
element.setAttribute('href', context.url)
element.setAttribute('title', context.tooltip)
```

Bindings are separated according to the directive’s syntax.

The `=` character therefore has a directive-level meaning in forms such as `@attr` and `@on`; it should not be interpreted as a general JavaScript assignment operator.

---

## Event Expressions

`@on` uses a specialized binding syntax:

```text
event=handler
```

For example:

```html
<button @on="click=save"></button>
<form @on="submit.prevent=save"></form>
```

The left side identifies the event and optional modifiers.

The right side identifies the handler expression.

A handler can reference a component method:

```html
<button @on="click=increment">
  Increment
</button>
```

Roughly equivalent to:

```js
element.addEventListener('click', () => context.increment())
```

It can also use the call syntax supported by the DSL:

```html
<button @on="click=save:message">
  Save
</button>
```

Roughly equivalent to:

```js
element.addEventListener('click', () => context.save(context.message))
```

Event handling has additional restrictions and modifier syntax. See [`@on`](./on.md).

---

## Directive-Specific Syntax

The shared expression language is intentionally small, but directives do not all accept the same value shape.

| Directive | Value form |
|-----------|------------|
| `@text` | Expression or static value |
| `@bind` | Property path |
| `@on` | `event[.modifier]=handler` |
| `@ref` | Reference name |
| `@if` | Conditional expression |
| `@elseif` | Conditional expression |
| `@else` | No expression |
| `@show` | Conditional expression |
| `@for` | List-rendering expression defined by `@for` |
| `@class` | Static class value, conditionals, and expressions |
| `@style` | Static style value or style bindings |
| `@attr` | Space-separated `attribute=expression` bindings |
| `@teleport` | Target expression |

The directive determines how the expression result is interpreted and applied to the DOM.

Do not assume that syntax valid for one directive is automatically valid for another.

For example, `@attr` uses named bindings:

```html
<a @attr="href=url title=tooltip"></a>
```

while `@text` normally takes a single expression:

```html
<span @text="user.name"></span>
```

See the individual directive documentation for the complete rules.

---

## Static Values vs Reactive Expressions

A directive may distinguish between a literal value and an expression that reads from the component context.

For example:

```html
<div @class="'panel elevated'"></div>
```

uses a quoted literal.

By contrast:

```html
<div @class="sizeClass"></div>
```

reads `sizeClass` from the component context.

When a directive evaluates an expression reactively, reads performed while evaluating that expression can become dependencies of the corresponding DOM binding.

This is what allows a binding such as:

```html
<span @text="user.name"></span>
```

to update when the value it depends on changes.

Not every directive is reactive in the same way. Event handlers, refs, and structural directives have their own runtime behavior.

---

## Evaluation Context

Template expressions are evaluated against the component’s template context.

This provides access to values exposed to the template, including:

- Component state  
- Computed values  
- Methods  
- Props  
- Template standard-library helpers  

For example:

```js
const Greeting = createComponent({
  name: "Greeting",

  state() {
    return {
      userName: "attamah",
    };
  },

  template: () => html`
    <p @text="userName | capitalise"></p>
  `,
});
```

Here:

- `userName` resolves to the component’s state value  
- `capitalise` resolves to a template helper  

The pipeline then passes the value of `userName` to `capitalise`.

See [Context](../fundamentals/context.md) for the component values available to templates.

---

## No Arbitrary JavaScript

The template DSL is intentionally more restricted than JavaScript.

For example, do not use JavaScript call syntax:

```text
save(message)
```

Use the DSL call syntax:

```text
save:message
```

Likewise, template expressions are not general-purpose JavaScript statements. They are limited to the expression forms supported by Udodi’s template runtime.

This restriction keeps templates predictable and allows the runtime to parse and evaluate expressions without embedding arbitrary JavaScript execution into directive values.

---

## Parsing and Evaluation

At runtime, template expressions follow a compilation pipeline:

```text
directive value
       │
       ▼
     lexer
       │
       ▼
     tokens
       │
       ▼
     parser
       │
       ▼
      AST
       │
       ▼
    compiler
       │
       ▼
 VM instructions
       │
       ▼
   evaluator
       │
       ▼
component template context
       │
       ▼
directive operation
       │
       ▼
      DOM
```

The application normally interacts only with the template syntax.

Tokenization, parsing, compilation, and evaluation are handled by the framework runtime.

---

## Expression Examples

**Reading state**

```html
<span @text="userName"></span>
```

**Reading a nested value**

```html
<span @text="user.profile.name"></span>
```

**Calling a helper**

```html
<span @text="userName | capitalise"></span>
```

**Calling a function with arguments**

```html
<span @text="formatDate:createdAt:'yyyy-MM-dd'"></span>
```

**Conditional class**

```html
<div @class="isActive=>'active'"></div>
```

**Reactive class expression**

```html
<div @class="sizeClass"></div>
```

**Multiple class expressions**

```html
<div @class="isActive=>'active' sizeClass"></div>
```

**Attribute bindings**

```html
<img @attr="src=imageUrl alt=imageAlt" />
```

**Event handler**

```html
<button @on="click=increment"></button>
```

**Event handler with a modifier**

```html
<form @on="submit.prevent=save"></form>
```

---

## Common Mistakes

### Using JavaScript call syntax

Incorrect:

```html
<span @text="capitalise(userName)"></span>
```

Correct:

```html
<span @text="capitalise:userName"></span>
```

Or, using the pipeline form:

```html
<span @text="userName | capitalise"></span>
```

### Treating `=` as JavaScript assignment

Incorrect:

```html
<span @text="name=value"></span>
```

The `=` syntax is used by directives that define named bindings, such as:

```html
<a @attr="href=url"></a>
```

### Assuming every directive accepts the same syntax

For example, `@attr` accepts multiple named bindings:

```html
<a @attr="href=url title=tooltip"></a>
```

while `@text` normally represents one value:

```html
<span @text="user.name"></span>
```

Always consult the directive-specific guide when in doubt.

---

## Mental Model

The DSL can be understood as a small language between HTML and the runtime:

```text
HTML template
     │
     ├── normal HTML
     │
     └── @directive="expression"
                    │
                    ▼
              DSL parser
                    │
                    ▼
             compiled expression
                    │
                    ▼
          component context
                    │
                    ▼
             directive logic
                    │
                    ▼
                  DOM
```

The important distinction is:

- HTML describes structure  
- directives describe behavior  
- the DSL describes the values used by that behavior  

For example:

```html
<button @on="click=save">
  <span @text="label"></span>
</button>
```

- The HTML defines the structure  
- `@on` defines the event behavior  
- `@text` defines the text binding  
- `save` and `label` are DSL expressions resolved by the template runtime  

---

## Constraints

| Rule | Description |
|------|-------------|
| Limited expression language | Templates do not evaluate arbitrary JavaScript |
| Function calls | Use `:` rather than JavaScript parentheses |
| Pipelines | Use `\|` to pass one result into the next expression |
| Conditionals | Use `=>` where supported by the directive |
| Bindings | Directives such as `@attr` and `@on` use `=` for named bindings |
| Directive-specific syntax | Each directive can impose additional parsing and evaluation rules |
| Context-based resolution | Expressions resolve against the component template context |

---

## Next Steps

* [Template Overview](./overview.md) — understand how templates and directives fit together  
* [`@text`](./text.md) — bind text content  
* [`@bind`](./bind.md) — bind form controls  
* [`@on`](./on.md) — handle DOM events  
* [`@ref`](./ref.md) — reference DOM elements  
* [`@if`](./if.md) — conditionally render content  
* [`@show`](./show.md) — toggle visibility  
* [`@for`](./for.md) — render lists  
* [`@class`](./class.md) — manage classes  
* [`@style`](./style.md) — manage inline styles  
* [`@attr`](./attr.md) — bind attributes  
* [`@teleport`](./teleport.md) — render into another DOM target  
* [Context](../fundamentals/context.md) — understand what templates can resolve  
* [Reactivity Overview](../reactivity/overview.md) — understand reactive dependency tracking  
