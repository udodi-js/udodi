/**
 * bindingQueue.js
 * Centralized deferred binding queue for nested structures (@for, etc.)
 */

import { bindDOM } from "./bindDOM.js";
import { extractAllDirectives } from "./directive.js";

let pendingBindings = [];
let isFlushing = false;

/**
 * Queue a child element to be bound after the current bindDOM call completes.
 * @param {HTMLElement} el - Element to bind
 * @param {Object} context - Context object for this element
 * @param {Object} scope - Scope object for effects/cleanup
 */
export function queueBinding(el, context, scope) {
	if (el._bound) return; // Prevent double binding
	el._bound = true;

	pendingBindings.push({ el, context, scope });
}

/**
 * Flush all pending bindings.
 * Called automatically after top-level bindDOM.
 */
export function flushBindingQueue() {
	if (isFlushing || pendingBindings.length === 0) return;

	isFlushing = true;
	const toBind = [...pendingBindings];
	pendingBindings = [];

	for (const { el, context, scope } of toBind) {
		try {
			const directives = extractAllDirectives(el);
			bindDOM(directives, context, scope);
		} catch (err) {
			console.warn("[BindingQueue] Failed to bind element:", err);
		}
	}

	isFlushing = false;

	// If new bindings were queued during this flush, schedule another pass
	if (pendingBindings.length > 0) {
		queueMicrotask(flushBindingQueue);
	}
}

/**
 * Schedule a flush after the current execution stack completes.
 * Safe to call multiple times — only one flush will run per tick.
 */
export function scheduleFlush() {
	queueMicrotask(flushBindingQueue);
}

/**
 * Clear bindings for elements that are no longer in the DOM (cleanup safety).
 */
export function clearOrphanedBindings() {
	pendingBindings = pendingBindings.filter(item => item.el.isConnected);
}