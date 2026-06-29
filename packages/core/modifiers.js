/**
 * Event modifier bit flags.
 *
 * These constants allow multiple modifiers to be stored efficiently
 * as a single integer (bitmask) in compiled event bindings.
 */

export const MOD_PREVENT = 1 << 0;     // 1
export const MOD_STOP = 1 << 1;        // 2
export const MOD_SELF = 1 << 2;        // 4

export const MOD_ENTER = 1 << 3;       // 8
export const MOD_ESC = 1 << 4;         // 16
export const MOD_SPACE = 1 << 5;       // 32
export const MOD_TAB = 1 << 6;         // 64

export const MOD_PASSIVE = 1 << 7;     // 128
export const MOD_NONPASSIVE = 1 << 8;  // 256
export const MOD_ONCE = 1 << 9;        // 512

/**
 * Maps modifier names (as they appear in templates) to their bit flags.
 *
 * @type {Record<string, number>}
 */
export const MOD_MAP = {
	prevent: MOD_PREVENT,
	stop: MOD_STOP,
	self: MOD_SELF,

	enter: MOD_ENTER,
	esc: MOD_ESC,
	space: MOD_SPACE,
	tab: MOD_TAB,

	passive: MOD_PASSIVE,
	nonpassive: MOD_NONPASSIVE,
	once: MOD_ONCE,
};

/**
 * Compiles an array of modifier strings into a bitmask.
 *
 * @param {string[]} [modifiers=[]] - Array of modifier names (e.g. ["prevent", "stop", "once"])
 * @returns {number} Bitmask representing all active modifiers
 *
 * @example
 * compileModifiers(["prevent", "stop", "once"]) // returns 515 (1 + 2 + 512)
 */
export function compileModifiers(modifiers = []) {
	let flags = 0;

	for (let i = 0; i < modifiers.length; i++) {
		const flag = MOD_MAP[modifiers[i]];
		if (flag !== undefined) {
			flags |= flag;
		}
	}

	return flags;
}

/**
 * Fast version for single modifier (used internally if needed).
 *
 * @param {string} mod - Single modifier name
 * @returns {number} Bit flag or 0
 */
export function getModifierFlag(mod) {
	return MOD_MAP[mod] || 0;
}
