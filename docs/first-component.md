# Your First Component

A Udodi component combines reactive state, derived values, behavior, lifecycle hooks, styling, and declarative markup into a single component definition.

This guide takes a closer look at the structure of a Udodi component and explains how its different options work together.

If you are completely new to Udodi, start with the [Quick Start](./quick-start.md) first.

---

## A Complete Component

A component can be created with `createComponent()`:

```js
import { createComponent, css, html, render } from "udodi";

const Counter = createComponent({
	name: "Counter",

	state() {
		return {
			count: 0,
			step: 1,
		};
	},

	computed: {
		doubled(ctx) {
			return ctx.count * 2;
		},

		displayValue(ctx) {
			return `${ctx.count} × 2 = ${ctx.doubled}`;
		},
	},

	watch: {
		countChange: {
			deps: ["count"],
			handler(newValues, oldValues) {
				console.log(
					`Count changed from ${oldValues.count} to ${newValues.count}`,
				);
			},
		},
	},

	methods: {
		increment() {
			this.count += this.step;
		},

		decrement() {
			this.count -= this.step;
		},

		reset() {
			this.count = 0;
		},
	},

	onMount(root, ctx) {
		console.log("Counter mounted");
	},

	onUnmount(root, ctx) {
		console.log("Counter unmounted");
	},

	interceptors: {
		count(value) {
			return Math.max(0, value);
		},
	},

	style: css`
		.counter {
			max-width: 320px;
			margin: 2rem auto;
			padding: 2rem;
			text-align: center;
		}

		.value {
			font-size: 1.5rem;
			font-weight: bold;
		}
	`,

	template: () => html`
		<main class="counter">
			<h1>Counter</h1>

			<p class="value">
				<span @text="count"></span>
			</p>

			<p>
				<span @text="displayValue"></span>
			</p>

			<button @on="click=decrement">-</button>
			<button @on="click=reset">Reset</button>
			<button @on="click=increment">+</button>
		</main>
	`,
});

render(Counter(), "#app");
```

A component definition can contain the following major areas:

| Option         | Responsibility                                      |
| -------------- | --------------------------------------------------- |
| `name`         | Identifies the component                            |
| `state`        | Creates the component's reactive state              |
| `computed`     | Defines values derived from reactive state          |
| `watch`        | Responds to changes in top-level state dependencies |
| `methods`      | Defines reusable component behavior                 |
| `onMount`      | Runs after the component is mounted                 |
| `onUnmount`    | Runs before the component is cleaned up             |
| `interceptors` | Transforms or cancels root state assignments        |
| `style`        | Defines component-scoped CSS                        |
| `template`     | Defines the component's declarative markup          |

Not every component needs every option. Start with the options your component actually needs and add others as its responsibilities grow.


## Component Name

The `name` option gives a component an identifiable name:

```js
const Counter = createComponent({
	name: "Counter",

	// ...
});
```

A component name can make development and debugging easier and may be used by tooling and error messages.

Use a meaningful name that describes the component's purpose:

```js
name: "UserProfile";
```

```js
name: "LoginForm";
```

```js
name: "ProductList";
```

The component variable and component name do not have to be identical, although keeping them consistent is usually clearer.


## Component State

Use `state()` to create the reactive state for each component instance:

```js
state() {
  return {
    count: 0,
    step: 1,
  };
},
```

The `state` option is a function rather than a shared object. This ensures that every component instance receives its own state object.

For example:

```js
const Counter = createComponent({
	state() {
		return {
			count: 0,
		};
	},

	// ...
});
```

If the same component is instantiated multiple times, each instance gets independent state.

Udodi's component state is shallow and path-based. Top-level state properties are tracked reactively.

```js
state() {
  return {
    count: 0,
    message: "Hello",
  };
},
```

You can update state from component methods:

```js
methods: {
  increment() {
    this.count++;
  },
},
```

The reactive runtime then updates the parts of the DOM that depend on the changed state.

Learn more in [State](./fundamentals/state.md).


## Computed Values

Use `computed` for values derived from reactive state:

```js
computed: {
  doubled(ctx) {
    return ctx.count * 2;
  },

  displayValue(ctx) {
    return `${ctx.count} × 2 = ${ctx.doubled}`;
  },
},
```

A computed value automatically tracks the reactive state it reads.

If `count` changes:

```js
this.count++;
```

Udodi recalculates the affected computed values and updates the DOM bindings that depend on them.

Computed values are ideal for:

- Formatting state for display
- Calculating totals
- Deriving UI state
- Combining multiple reactive values

For example:

```js
computed: {
  total(ctx) {
    return ctx.price * ctx.quantity;
  },
},
```

Use `computed` when the value can be derived from existing state. Use methods when you need to perform an action.

Learn more in [Computed Values](./fundamentals/computed.md).


## Methods

The `methods` option defines reusable component behavior:

```js
methods: {
  increment() {
    this.count++;
  },

  decrement() {
    this.count--;
  },

  reset() {
    this.count = 0;
  },
},
```

Methods are bound to the component context, allowing them to access component state through `this`.

Methods can be used by:

- Event handlers
- Template resolvers
- Other component behavior
- Application logic associated with the component

For example:

```html
<button @on="click=increment">+</button>
```

The method name is referenced by the template DSL rather than by writing an arbitrary JavaScript expression inside the directive.

Learn more in [Methods](./fundamentals/methods.md).


## Watching State

The `watch` option lets you run side effects when specified top-level state dependencies change.

```js
watch: {
  countChange: {
    deps: ["count"],

    handler(newValues, oldValues) {
      console.log(
        `Count changed from ${oldValues.count} to ${newValues.count}`
      );
    },
  },
},
```

The watcher declares the state dependencies it observes:

```js
deps: ["count"];
```

The handler receives maps containing the new and previous values:

```js
handler(newValues, oldValues) {
  // newValues.count
  // oldValues.count
}
```

Watchers are intended for side effects rather than derived values.

For example, a watcher might:

- Synchronize state with an external system
- Persist a change
- Trigger asynchronous work
- Log state changes

If you only need to calculate a value from state, use `computed` instead.

Learn more in [Watchers](./fundamentals/watch.md).


## Lifecycle Hooks

Components can respond to their lifecycle with `onMount` and `onUnmount`.

### `onMount`

`onMount` runs after the component has been bound to the DOM:

```js
onMount(root, ctx) {
  console.log("Component mounted");
},
```

The `root` argument refers to the component's root DOM element, while `ctx` provides access to the component context.

Use `onMount` for component-specific initialization, such as:

- Registering external event listeners
- Starting timers
- Initializing subscriptions
- Connecting to external resources

You can also register cleanup logic:

```js
onMount(root, ctx) {
  const timer = setInterval(() => {
    console.log("Running...");
  }, 1000);

  ctx.cleanup(() => {
    clearInterval(timer);
  });
},
```

Udodi executes registered cleanup callbacks when the component is unmounted.

### `onUnmount`

`onUnmount` runs before the component is cleaned up:

```js
onUnmount(root, ctx) {
  console.log("Component unmounted");
},
```

Use it when you need to perform explicit teardown logic.

Udodi also cleans up resources associated with the component, including directive effects, event listeners, and watchers.

Learn more in [Lifecycle](./fundamentals/lifecycle.md).


## Interceptors

The `interceptors` option lets you intercept root state assignments before they are committed.

For example:

```js
interceptors: {
  count(value) {
    return Math.max(0, value);
  },
},
```

If an assignment attempts to set `count` below zero, the interceptor transforms the value:

```js
this.count = -10;
```

The committed value becomes:

```js
0;
```

An interceptor can also cancel an assignment by returning `undefined`:

```js
interceptors: {
  phoneNumber(value) {
    const onlyNumbers = value.replace(/\D/g, "");

    return value === onlyNumbers
      ? value
      : undefined;
  },
},
```

Interceptors are useful for:

- Normalizing values
- Transforming input
- Enforcing state constraints
- Rejecting invalid assignments

Learn more in [Interceptors](./fundamentals/interceptor.md).


## Component Styles

A component can define its CSS through the `style` option:

```js
style: css`
  .counter {
    padding: 2rem;
  }

  .value {
    font-size: 1.5rem;
  }
`,
```

Udodi processes component styles through its CSS scoping system so styles remain scoped to the component.

This allows the component's markup and styles to live together:

```js
const Counter = createComponent({
	style: css`
		.counter {
			padding: 2rem;
		}
	`,

	template: () => html`
		<main class="counter">
			<h1>Counter</h1>
		</main>
	`,
});
```

The optional `css` helper is a pass-through tagged template that can provide editor syntax highlighting.

Learn more in [Component Styles](./fundamentals/styles.md) and [CSS Scoping](./advanced/css-scoping.md).


## Templates

The `template` option defines the component's declarative HTML:

```js
template: () => html`
  <main class="counter">
    <h1>Counter</h1>

    <p>
      Count:
      <span @text="count"></span>
    </p>

    <button @on="click=increment">+</button>
  </main>
`,
```

A template can be provided as a string or as a function that returns a string.

The rendered template must have exactly one root element.

Udodi templates use a minimal declarative DSL instead of arbitrary JavaScript expressions.

For example:

```html
<span @text="count"></span>
```

binds text content to reactive state.

And:

```html
<button @on="click=increment">+</button>
```

connects a DOM event to a component method.

The optional `html` helper is a pass-through tagged template that can provide editor syntax highlighting.

Learn more in [Templates and Directives](./templates/) and [Template DSL](./templates/dsl.md).


## Creating the Component

`createComponent()` creates a component factory:

```js
const Counter = createComponent({
	name: "Counter",

	// component options
});
```

Calling the returned factory creates a component instance placeholder:

```js
Counter();
```

The placeholder can then be rendered into a DOM element:

```js
render(Counter(), "#app");
```

This separation allows component definitions to be reused:

```js
render(Counter(), "#counter-one");
render(Counter(), "#counter-two");
```

Each instance receives its own state when `state()` is called.


## Component Context

Several component features receive access to the component context.

For example, computed values receive `ctx`:

```js
computed: {
  doubled(ctx) {
    return ctx.count * 2;
  },
},
```

Lifecycle hooks receive both the root element and context:

```js
onMount(root, ctx) {
  // ...
},
```

The component context provides access to the component's runtime state and capabilities.

The exact context available depends on where it is used. When working with the context directly, see the [Context](./fundamentals/context.md) guide for the supported properties and behavior.


## A Minimal Component

Not every component needs all available options.

A simple component can be as small as:

```js
const Greeting = createComponent({
	state() {
		return {
			message: "Hello, Udodi!",
		};
	},

	template: () => html` <h1 @text="message"></h1> `,
});

render(Greeting(), "#app");
```

As the component grows, additional capabilities can be added:

```text
Component
├── name
├── state()
├── computed
├── watch
├── methods
├── onMount
├── onUnmount
├── interceptors
├── style
└── template
```

The important principle is to keep each option focused on its responsibility:

- **State** stores reactive data.
- **Computed values** derive data.
- **Methods** perform actions.
- **Watchers** handle side effects.
- **Lifecycle hooks** manage setup and cleanup.
- **Interceptors** control state assignments.
- **Styles** define component presentation.
- **Templates** define the UI structure.

This separation makes components easier to understand and maintain.


## Recommended Component Structure

As components become more complex, keeping a consistent ordering makes them easier to scan.

A typical component can follow this structure:

```js
const UserProfile = createComponent({
	name: "UserProfile",

	state() {
		return {
			name: "",
			email: "",
		};
	},

	computed: {
		displayName(ctx) {
			return ctx.name || "Anonymous";
		},
	},

	watch: {
		nameChange: {
			deps: ["name"],
			handler(newValues, oldValues) {
				// Handle name changes.
			},
		},
	},

	methods: {
		updateProfile() {
			// Component behavior.
		},
	},

	onMount(root, ctx) {
		// Initialization.
	},

	onUnmount(root, ctx) {
		// Cleanup.
	},

	interceptors: {
		name(value) {
			return value.trim();
		},
	},

	style: css`
		.profile {
			/* Component styles. */
		}
	`,

	template: () => html`
		<section class="profile">
			<!-- Component markup. -->
		</section>
	`,
});
```

This ordering is not required, but it provides a consistent mental model:

```text
Identity
    ↓
State
    ↓
Derived State
    ↓
Side Effects
    ↓
Behavior
    ↓
Lifecycle
    ↓
State Interception
    ↓
Presentation
    ↓
Markup
```


## Complete Example

Here is the complete component from this guide:

```js
import { createComponent, css, html, render } from "udodi";

const Counter = createComponent({
	name: "Counter",

	state() {
		return {
			count: 0,
			step: 1,
		};
	},

	computed: {
		doubled(ctx) {
			return ctx.count * 2;
		},

		displayValue(ctx) {
			return `${ctx.count} × 2 = ${ctx.doubled}`;
		},
	},

	watch: {
		countChange: {
			deps: ["count"],
			handler(newValues, oldValues) {
				console.log(
					`Count changed from ${oldValues.count} to ${newValues.count}`,
				);
			},
		},
	},

	methods: {
		increment() {
			this.count += this.step;
		},

		decrement() {
			this.count -= this.step;
		},

		reset() {
			this.count = 0;
		},
	},

	onMount(root, ctx) {
		console.log("Counter mounted");
	},

	onUnmount(root, ctx) {
		console.log("Counter unmounted");
	},

	interceptors: {
		count(value) {
			return Math.max(0, value);
		},
	},

	style: css`
		.counter {
			max-width: 320px;
			margin: 2rem auto;
			padding: 2rem;
			text-align: center;
		}

		.value {
			font-size: 1.5rem;
			font-weight: bold;
		}
	`,

	template: () => html`
		<main class="counter">
			<h1>Counter</h1>

			<p class="value">
				<span @text="count"></span>
			</p>

			<p>
				<span @text="displayValue"></span>
			</p>

			<button @on="click=decrement">-</button>
			<button @on="click=reset">Reset</button>
			<button @on="click=increment">+</button>
		</main>
	`,
});

render(Counter(), "#app");
```


## Where to Go Next

Now that you understand the anatomy of a Udodi component, continue with the concept that matches what you want to build:

- [State](./fundamentals/state.md) — Learn how reactive component state works.
- [Computed Values](./fundamentals/computed.md) — Create values derived from reactive state.
- [Methods](./fundamentals/methods.md) — Define reusable component behavior.
- [Watchers](./fundamentals/watch.md) — Respond to top-level state changes.
- [Interceptors](./fundamentals/interceptor.md) — Transform or cancel state assignments.
- [Lifecycle](./fundamentals/lifecycle.md) — Manage component setup and cleanup.
- [Props](./fundamentals/props.md) — Pass data between components.
- [Context](./fundamentals/context.md) — Understand the component context.
- [Component Styles](./fundamentals/styles.md) — Define component-scoped styles.
- [Templates and Directives](./templates/) — Learn Udodi's declarative template system.

For a broader overview of the framework, return to the [Quick Start](./quick-start.md).
