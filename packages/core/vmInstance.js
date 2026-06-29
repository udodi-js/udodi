import { VM } from "./vm.js";

// Internal singleton VM instance
let vmInstance = null;

/**
 * Get the shared VM instance (lazy initialization).
 * This is internal to the library — users should never call this.
 */
export function getVM() {
	if (!vmInstance) {
        // Create a new VM instance with an empty context by default.
        // We can later extend this to accept a global context or default helpers if needed.
		vmInstance = new VM();
	}
    
	return vmInstance;
}

/**
 * Reset VM (mainly useful for testing / hot reload)
 */
export function resetVM() {
	vmInstance = null;
}
