import { unmountFunctions } from "./lifecycle.js";

/**
 * Unmounts every registered component root under `container`.
 *
 * Walks all element children (not only the first) so stacked mounts
 * in the same container each receive their lifecycle teardown.
 * Registered unmount handlers and the global cleanup observer own
 * the detailed cleanup work.
 *
 * @param {Element|null|undefined} container - Parent whose children should be unmounted.
 * @returns {void}
 */
export function unmount(container) {
	if (!container) {
		return;
	}

	let child = container.firstElementChild;

	while (child) {
		const next = child.nextElementSibling;
		const unmountFn = unmountFunctions.get(child);

		if (unmountFn !== undefined) {
			unmountFn();
		}

		child = next;
	}

	container.innerHTML = "";
}
