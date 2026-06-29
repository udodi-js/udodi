/**
 * Component Registry
 *
 * Uses a dynamically growing array for high-performance component placeholder storage.
 * Starts with initial capacity and grows by 1.5x when needed.
 */

const INITIAL_CAPACITY = 256; // Start with 256 entries, can grow as needed
let nextId = 0;
let registry = new Array(INITIAL_CAPACITY);
let capacity = INITIAL_CAPACITY;

/**
 * Adds a new component to the registry and returns a placeholder HTML string.
 *
 * @param {Function} Component - The component factory function
 * @param {Object} [props={}] - Props to pass to the component
 * @returns {string} HTML placeholder with id attribute
 */
export function addComponent(Component, props = {}) {
    const id = nextId++;

    // Grow array if needed (1.5x growth strategy)
    if (id >= capacity) {
        capacity = Math.ceil(capacity * 1.5);
        const newRegistry = new Array(capacity);
        
        // Copy existing entries
        for (let i = 0; i < registry.length; i++) {
            newRegistry[i] = registry[i];
        }
        
        registry = newRegistry;
    }

    registry[id] = {
        Component,
        props
    };

    return `<udodi-component id="${id}"></udodi-component>`;
}

/**
 * Retrieves a component entry by its ID.
 *
 * @param {number} id - The component ID
 * @returns {Object|undefined} The component entry or undefined if not found
 */
export function getComponent(id) {
    return registry[id];
}

/**
 * Removes a component from the registry (for cleanup).
 *
 * @param {number} id - The component ID to remove
 */
export function removeComponent(id) {
    if (id >= 0 && id < registry.length) {
        registry[id] = null; // Mark as deleted without creating holes
    }
}

/**
 * Clears the entire registry and resets capacity.
 * Useful for testing, hot reload, or full app reset.
 */
export function clear() {
    registry = new Array(INITIAL_CAPACITY);
    capacity = INITIAL_CAPACITY;
    nextId = 0;
}

/**
 * Returns the current number of registered components.
 * Note: This counts only non-null entries.
 *
 * @returns {number} Number of active components in registry
 */
export function getRegistrySize() {
    let count = 0;
    for (let i = 0; i < nextId; i++) {
        if (registry[i] != null) count++;
    }
    return count;
}

/**
 * Returns current registry capacity (for debugging).
 */
export function getRegistryCapacity() {
    return capacity;
}
