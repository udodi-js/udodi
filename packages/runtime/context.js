/**
 * Resolves a value from the lexical scope chain.
 *
 * Searches the current scope and then walks the `__parent`
 * chain until the property is found.
 *
 * @param {Object|null} context
 * @param {string} key
 * @returns {*}
 */
export function resolveContextValue(context, key) {
	let scope = context;

	while (scope != null) {
		if (Object.hasOwn(scope, key)) {
			return scope[key];
		}
		scope = scope.__parent;
	}

	return undefined;
}

/**
 * Resolves the scope object that owns a property.
 *
 * Searches the current scope and then walks the `__parent`
 * chain until a scope containing the property is found.
 *
 * @param {Object|null} context
 * @param {string} key
 * @returns {Object|null}
 */
export function resolveContextOwner(context, key) {
	let scope = context;

	while (scope != null) {
		if (Object.hasOwn(scope, key)) {
			return scope;
		}
		scope = scope.__parent;
	}

	return null;
}

/**
 * Creates a new lexical scope that inherits from a parent context.
 *
 * Child contexts are used by directives such as `@for` to introduce
 * scoped variables (for example, `item` and `index`) without mutating
 * the parent context.
 *
 * The parent scope is linked explicitly through the `__parent`
 * property and is traversed by `evaluatePath()` when resolving
 * identifiers.
 *
 * @example
 * ```js
 * const child = createChildContext(parent);
 *
 * child.user = getUser;
 * child.userIndex = getIndex;
 * ```
 *
 * Resulting scope chain:
 * ```text
 * child
 *   ├── user
 *   ├── userIndex
 *   └── __parent
 * ```
 *
 * @param {Object|null} parent
 *   The parent lexical scope. May be `null` for a root context.
 *
 * @returns {{ __parent: Object | null }}
 *   A new child context linked to the given parent.
 */
export function createChildContext(parent) {
	return {
		__parent: parent,
	};
}
