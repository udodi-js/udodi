# Template DSL

Udodi templates use a small expression language for connecting markup to component data and behavior.

Directive values are parsed by the template expression runtime and evaluated against the component context. The DSL intentionally provides a limited syntax rather than exposing arbitrary JavaScript expressions.

Individual directives build on this shared expression syntax and may impose additional rules on the value they accept. For example, `@on` defines event-handler syntax, `@for` defines list-rendering syntax, and `@attr` accepts multiple attribute bindings.

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

## Function Calls

Udodi supports two ways to invoke a function from a template expression.

### Call with arguments (colon syntax)

Use `:` to pass arguments:

```text
formatDate:createdAt
formatDate:createdAt:'MMM DD'
add:a:b
save:message
```

Roughly equivalent to:

```js
formatDate(createdAt)
formatDate(createdAt, 'MMM DD')
add(a, b)
save(message)
```

The name before the first `:` identifies the function. Each subsequent `:` supplies an argument.

Arguments can themselves be expressions, including paths and literals.

### Call without arguments (bare name)

A bare name that resolves to a function is automatically invoked:

```text
save
increment
refresh
```

This looks identical to a path, but the runtime checks the resolved value:

* If the value is a function, it is called with no arguments.
* If the value is not a function, it is treated as a normal path (the value itself is used).

Roughly equivalent to:

```js
// when `save` is a function on the context
context.save()

// when `label` is a plain value
context.label
```

This is the form commonly used for event handlers that take no arguments:

```html
<button @on="click=save"></button>
```

| Form             | Meaning                                                    | Example                 |
| ---------------- | ---------------------------------------------------------- | ----------------------- |
| `name`           | Call the function with no arguments or read the path value | `save`, `label`         |
| `name:arg`       | Call the function with one argument                        | `save:message`          |
| `name:arg1:arg2` | Call the function with multiple arguments                  | `formatDate:date:'MMM'` |

Do not write function calls using JavaScript parentheses:

```js
formatDate(createdAt)   // incorrect in templates
save()                  // incorrect in templates
```

Function calls are primarily useful with component methods and template standard-library helpers.

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

The first pipeline step may be any expression. Subsequent pipeline steps must resolve to callable functions.

Pipelines are particularly useful for small formatting operations that do not justify a component method.

## Conditional Expressions

The `=>` syntax represents a conditional value:

```text
isActive => 'active'
```

Roughly equivalent to:

```js
isActive ? 'active' : undefined
```

When `isActive` is `true`, the right-hand expression is evaluated and its value is returned. When it is `false`, the conditional produces no value (`undefined`).

This form is particularly useful with `@class`:

```html
<div @class="isActive=>'active'"></div>
```

### Conditional right-hand expressions

The right-hand side of `=>` is a full DSL expression. It is not restricted to a literal.

For example, the value can be a path:

```text
isActive => activeClass
```

A function call:

```text
isActive => getClass
isActive => getClass:size
```

Or a pipeline:

```text
isActive => name | capitalise
```

It can therefore be used to conditionally evaluate dynamic values rather than only fixed literals.

For example:

```html
<div @class="isActive=>activeClass"></div>
```

The condition is evaluated first. The right-hand expression is evaluated only when the condition resolves to `true`.

The conditional expression therefore has the conceptual structure:

```text
condition => expression
```

Both sides are expressions, although the directive consuming the result may impose additional restrictions on the overall expression.

### Conditional expressions and composition

Multiple conditional and ordinary expressions can be combined where the directive supports them:

```html
<div @class="isActive=>'active' sizeClass"></div>
```

Here:

* `isActive=>'active'` conditionally contributes the `active` class
* `sizeClass` resolves a class value from the component context

Conditional syntax is directive-dependent. It is most commonly used for class composition.

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

* `href`  →  `url`
* `title`  →  `tooltip`

Roughly equivalent to:

```js
element.setAttribute('href', context.url)
element.setAttribute('title', context.tooltip)
```

Bindings are separated according to the directive's syntax.

The `=` character therefore has a directive-level meaning in forms such as `@attr` and `@on`; it should not be interpreted as a general JavaScript assignment operator.

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

The left side identifies the event and optional modifiers, and the right side identifies the handler expression.

### Multiple event bindings

`@on` accepts multiple event bindings in the same directive value:

```html
<button @on="click=save mouseover=highlight"></button>
```

Each binding is independent:

* `click=save` binds the `click` event to `save`
* `mouseover=highlight` binds the `mouseover` event to `highlight`

Modifiers can be used independently on each event:

```html
<form @on="submit.prevent=save keydown.stop=handleKey"></form>
```

This allows multiple events and their respective modifiers and handlers to be declared on a single `@on` attribute.

A handler can reference a component method with no arguments:

```html
<button @on="click=increment">
  Increment
</button>
```

Roughly equivalent to:

```js
element.addEventListener('click', (event) => context.increment())
```

It can also use the call syntax with arguments:

```html
<button @on="click=save:message">
  Save
</button>
```

Roughly equivalent to:

```js
element.addEventListener('click', (event) => context.save(context.message))
```

Event handlers can therefore use the same expression forms supported by the shared DSL, subject to the additional rules imposed by `@on`.

Event handling has additional restrictions and modifier syntax. See [`@on`](./on.md).

## Directive-Specific Syntax

The shared expression language is intentionally small, but directives do not all accept the same value shape.

| Directive   | Value form                                        |
| ----------- | ------------------------------------------------- |
| `@text`     | Expression or static value                        |
| `@bind`     | Property path                                     |
| `@on`       | One or more `event[.modifier]=handler` bindings   |
| `@ref`      | Reference name                                    |
| `@if`       | Conditional expression                            |
| `@elseif`   | Conditional expression                            |
| `@else`     | No expression                                     |
| `@show`     | Conditional expression                            |
| `@for`      | List-rendering expression defined by `@for`       |
| `@class`    | Static class value, conditionals, and expressions |
| `@style`    | Static style value or style bindings              |
| `@attr`     | Space-separated `attribute=expression` bindings   |
| `@teleport` | Target expression                                 |

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

## Expression Evaluation

Expressions are represented internally as expression nodes and lowered into the runtime's intermediate representation.

The supported expression forms include:

* Literals
* Paths
* Function calls
* Conditional expressions
* Pipelines

A conditional expression contains two expression nodes:

```text
condition => value
```

Conceptually:

```text
EXPR_CONDITIONAL
├── condition  →  expression
└── value      →  expression
```

This means the value side is not limited to literals. It can itself be lowered as another supported expression.

For example:

```text
isActive => user.name
```

contains:

```text
condition
└── path: isActive

value
└── path: user.name
```

Likewise:

```text
isActive => formatName:user
```

contains a function-call expression on the right-hand side.

Pipelines are lowered into nested function calls before evaluation. For example:

```text
user.id | url | encode
```

becomes conceptually:

```text
encode(url(user.id))
```

This keeps the runtime evaluator focused on a small set of expression types.

## Evaluation Context

Template expressions are evaluated against the component's template context.

This provides access to values exposed to the template, including:

* Component state
* Computed values
* Methods
* Props
* Template standard-library helpers

For example:

```js
const Greeting = createComponent({
  name: "Greeting",

  state() {
    return {
      userName: "attamah",
    };
  },

  template: html`
    <p @text="userName | capitalise"></p>
  `,
});
```

Here:

* `userName` resolves to the component's state value
* `capitalise` resolves to a template helper

The pipeline then passes the value of `userName` to `capitalise`.

See [Context](../fundamentals/context.md) for the component values available to templates.

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

Likewise, template expressions are not general-purpose JavaScript statements. They are limited to the expression forms supported by Udodi's template runtime.

This restriction keeps templates predictable and allows the runtime to parse and evaluate expressions without embedding arbitrary JavaScript execution into directive values.

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

The compiler lowers expression nodes into VM-friendly intermediate representations.

Pipeline expressions are lowered into nested function calls, while conditional expressions retain their condition and value as independently evaluable expressions.

The application normally interacts only with the template syntax.

Tokenization, parsing, compilation, and evaluation are handled by the framework runtime.

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

**Conditional literal**

```html
<div @class="isActive=>'active'"></div>
```

**Conditional path**

```html
<div @class="isActive=>activeClass"></div>
```

**Conditional function**

```html
<span @text="showName=>getDisplayName:user"></span>
```

**Conditional pipeline**

```html
<span @text="showName=>userName | capitalise"></span>
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

**Multiple event bindings**

```html
<button @on="click=save mouseover=highlight"></button>
```

**Event handler**

```html
<button @on="click=increment"></button>
```

**Event handler with a modifier**

```html
<form @on="submit.prevent=save"></form>
```

**Multiple events with modifiers**

```html
<form @on="submit.prevent=save keydown.stop=handleKey"></form>
```

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

and:

```html
<button @on="click=save"></button>
```

### Assuming every directive accepts the same syntax

For example, `@attr` accepts multiple named bindings:

```html
<a @attr="href=url title=tooltip"></a>
```

`@on` also accepts multiple named event bindings:

```html
<button @on="click=save mouseover=highlight"></button>
```

while `@text` normally represents one value:

```html
<span @text="user.name"></span>
```

Always consult the directive-specific guide when in doubt.

### Assuming conditional values must be literals

Incorrect assumption:

```text
condition => 'only a literal is allowed here'
```

The right-hand side is an expression and can be a path, function call, or pipeline:

```text
condition => activeClass
condition => getClass:size
condition => name | capitalise
```

The consuming directive may still impose additional restrictions.

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

* HTML describes structure
* directives describe behavior
* the DSL describes the values used by that behavior

For example:

```html
<button @on="click=save">
  <span @text="label"></span>
</button>
```

* The HTML defines the structure
* `@on` defines the event behavior
* `@text` defines the text binding
* `save` and `label` are DSL expressions resolved by the template runtime

A directive may contain multiple expressions or bindings when its syntax permits them. For example:

```html
<button @on="click=save mouseover=highlight"></button>
```

contains two event bindings, while:

```html
<div @class="isActive=>'active' sizeClass"></div>
```

contains a conditional expression and an ordinary expression.

## Constraints

| Rule                        | Description                              |
| --------------------------- | ---------------------------------------- |
| Limited expression language | Templates do not evaluate arbitrary JavaScript                                                                                                               |
| Function calls              | Use `name` for a function with no arguments, or `name:arg1:arg2` for a function with arguments. Parentheses are not supported.                               |
| Pipelines                   | Use `\|` to pass one result into the next expression                                                                                                         |
| Conditionals                | Use `=>` where supported by the directive. The condition and right-hand value are expressions.                                                               |
| Conditional values          | The right-hand side of `=>` can be a path, function call, pipeline, or another supported expression.                                                         |
| Bindings                    | Directives such as `@attr` and `@on` use `=` for named bindings                                                                                              |
| Multiple bindings           | Directives that support named bindings can accept multiple bindings in one directive value. `@on`, for example, can contain multiple event-handler bindings. |
| Directive-specific syntax   | Each directive can impose additional parsing and evaluation rules                                                                                            |
| Context-based resolution    | Expressions resolve against the component template context                                                                                                   |
| No JavaScript call syntax   | Function invocation uses the DSL colon syntax rather than JavaScript parentheses                                                                             |
