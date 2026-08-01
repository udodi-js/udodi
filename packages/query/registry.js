/**
 * Query Pool Worker Module Registry.
 *
 * The registry describes executable query modules that can be loaded
 * inside Compute Workers.
 *
 * A registered module may expose:
 *
 *     export async function query(context) {}
 *
 * Or:
 *
 *     export default {
 *         query,
 *     };
 */

/**
 * @typedef {Object} QueryModuleDefinition
 *
 * @property {string} url
 * Module URL.
 *
 * @property {string} [queryExport]
 * Named export containing the query function.
 *
 * Defaults to "query".
 *
 * @property {string|null} [defaultExport]
 * Optional property name inside the default export object.
 *
 * @property {Object} [metadata]
 * Optional serializable metadata.
 */

/**
 * @typedef {Object} QueryModuleDescriptor
 *
 * @property {string} key
 * Registry key.
 *
 * @property {string} url
 * Module URL.
 *
 * @property {string} queryExport
 * Query export name.
 *
 * @property {string|null} defaultExport
 * Optional default export property.
 *
 * @property {Object|undefined} metadata
 * Optional metadata.
 *
 * @property {number} revision
 * Descriptor revision.
 */

/**
 * Create a Query Module Registry.
 *
 * @returns {Object}
 */
export function createQueryModuleRegistry() {
	const modules = new Map();

	let revision = 0;

	/**
	 * Validate a module key.
	 *
	 * @param {string} key
	 */
	function validateKey(key) {
		if (typeof key !== "string" || key.length === 0) {
			throw new TypeError(
				"[query-pool] Module key must be a non-empty string.",
			);
		}
	}

	/**
	 * Validate a module URL.
	 *
	 * @param {string} url
	 */
	function validateUrl(url) {
		if (typeof url !== "string" || url.length === 0) {
			throw new TypeError(
				"[query-pool] Module url must be a non-empty string.",
			);
		}
	}

	/**
	 * Validate a module definition.
	 *
	 * @param {QueryModuleDefinition} definition
	 */
	function validateDefinition(definition) {
		if (!definition || typeof definition !== "object") {
			throw new TypeError("[query-pool] Module definition must be an object.");
		}

		validateUrl(definition.url);

		if (
			definition.queryExport !== undefined &&
			typeof definition.queryExport !== "string"
		) {
			throw new TypeError("[query-pool] queryExport must be a string.");
		}

		if (
			definition.defaultExport !== undefined &&
			definition.defaultExport !== null &&
			typeof definition.defaultExport !== "string"
		) {
			throw new TypeError(
				"[query-pool] defaultExport must be a string or null.",
			);
		}

		if (
			definition.metadata !== undefined &&
			(definition.metadata === null || typeof definition.metadata !== "object")
		) {
			throw new TypeError("[query-pool] Module metadata must be an object.");
		}
	}

	/**
	 * Normalize a module definition.
	 *
	 * @param {string} key
	 * @param {QueryModuleDefinition} definition
	 * @returns {QueryModuleDescriptor}
	 */
	function normalizeDefinition(key, definition) {
		revision++;

		return {
			key,

			url: definition.url,

			queryExport: definition.queryExport || "query",

			defaultExport: definition.defaultExport ?? null,

			metadata: definition.metadata,

			revision,
		};
	}

	/**
	 * Register a query module.
	 *
	 * @param {string} key
	 * @param {QueryModuleDefinition} definition
	 * @returns {QueryModuleDescriptor}
	 */
	function register(key, definition) {
		validateKey(key);
		validateDefinition(definition);

		const descriptor = normalizeDefinition(key, definition);

		modules.set(key, descriptor);

		return descriptor;
	}

	/**
	 * Register multiple query modules.
	 *
	 * @param {Object<string, QueryModuleDefinition>} definitions
	 * @returns {QueryModuleDescriptor[]}
	 */
	function registerAll(definitions) {
		if (!definitions || typeof definitions !== "object") {
			throw new TypeError("[query-pool] Module definitions must be an object.");
		}

		const registered = [];

		for (const [key, definition] of Object.entries(definitions)) {
			registered.push(register(key, definition));
		}

		return registered;
	}

	/**
	 * Get a module descriptor.
	 *
	 * @param {string} key
	 * @returns {QueryModuleDescriptor|undefined}
	 */
	function get(key) {
		validateKey(key);

		return modules.get(key);
	}

	/**
	 * Check whether a module exists.
	 *
	 * @param {string} key
	 * @returns {boolean}
	 */
	function has(key) {
		validateKey(key);

		return modules.has(key);
	}

	/**
	 * Remove a module.
	 *
	 * @param {string} key
	 * @returns {boolean}
	 */
	function remove(key) {
		validateKey(key);

		return modules.delete(key);
	}

	/**
	 * Clear all modules.
	 */
	function clear() {
		modules.clear();
	}

	/**
	 * Get all module descriptors.
	 *
	 * @returns {QueryModuleDescriptor[]}
	 */
	function entries() {
		return Array.from(modules.values());
	}

	/**
	 * Get all module keys.
	 *
	 * @returns {string[]}
	 */
	function keys() {
		return Array.from(modules.keys());
	}

	/**
	 * Get module count.
	 *
	 * @returns {number}
	 */
	function size() {
		return modules.size;
	}

	return {
		register,
		registerAll,
		get,
		has,
		remove,
		clear,
		entries,
		keys,
		size,
	};
}
