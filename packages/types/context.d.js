/**
 * Framework stdlib helpers that are mixed into every component context.
 *
 * @typedef {Object} Stdlib
 * @property {(value: any) => string} trim
 * @property {(collection: any, key: any) => any} get
 * @property {(value: any) => string} upper
 * @property {(value: any) => string} lower
 * @property {(value: any) => string} capitalise
 * @property {(collection: any) => number} size
 * @property {(value: any) => boolean} negate
 * @property {(value: any) => boolean} n - Alias of `negate`.
 */

/**
 * Framework namespace attached to every component instance.
 * Exposed as a deep-readonly membrane on the public context.
 *
 * @typedef {Object} UdNamespace
 * @property {Record<string, any>} forms - Registry used by `@form` / `@submit`.
 */

/**
 * Internal context object (open VM surface).
 *
 * This is the concrete object handed to the template interpreter and
 * stored on the component instance as `context`. It contains:
 * - component name
 * - stdlib helpers
 * - `refs` bag
 * - `ud` namespace (live getter/setter into the reactive store)
 * - `_state` (non-enumerable link to the reactive store)
 * - state keys (accessor descriptors)
 * - computed keys (lazy getters)
 * - method keys
 * - prop keys
 *
 * Consumers should prefer `PublicContext` for user-facing code.
 *
 * @typedef {Stdlib & {
 *   name: string,
 *   refs: Record<string, HTMLElement | undefined>,
 *   ud: UdNamespace,
 *   _state: object,
 *   [key: string]: any
 * }} InternalContext
 */

/**
 * Public context membrane passed to user code
 * (methods, computed functions, lifecycle hooks, templates).
 *
 * It is a filtered Proxy over the internal context:
 * - State is readable and writable (top-level only).
 * - Computed values are read-only getters.
 * - Methods are bound functions (`this` === public context).
 * - Props are readable (reactive props stay live).
 * - `ud` is a deep-readonly membrane.
 * - `cleanup(fn)` can be injected after mount.
 * - Direct mutation of reserved keys or arbitrary new root keys throws.
 *
 * @typedef {Stdlib & {
 *   readonly name: string,
 *   readonly refs: Record<string, HTMLElement | undefined>,
 *   readonly ud: Readonly<UdNamespace>,
 *   cleanup: ((fn: () => void) => void) | null,
 *   [key: string]: any
 * }} PublicContext
 */

/**
 * Shape returned by the inner `Component(props)` factory.
 *
 * @typedef {Object} ComponentInstance
 * @property {string} name
 * @property {string} template
 * @property {string | null} scopeId
 * @property {InternalContext} context - Open VM context.
 * @property {PublicContext} publicContext - Filtered membrane for user code.
 * @property {(root: HTMLElement) => void} onMount
 * @property {(root: HTMLElement) => void} onUnmount
 */

export {};
