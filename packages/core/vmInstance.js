import { createVM } from "./vm.js";

// Internal singleton VM instance
let vmInstance = null;

/**
 * Get the shared VM instance (lazy initialization).
 * This is internal to the library — users should never call this.
 *
 * @returns {{
 *   evaluate: Function,
 *   execute: Function,
 *   bindEvent: Function,
 *   unbindEvent: Function
 * }}
 */
export function getVM() {
	if (vmInstance === null) {
		vmInstance = createVM();
	}

	return vmInstance;
}

/**
 * Reset VM (mainly useful for testing / hot reload)
 */
export function resetVM() {
	vmInstance = null;
}
