/**
 * Query Pool Transferable Utilities.
 *
 * Detects Transferable Objects that can be moved between worker
 * contexts without structured-cloning their underlying data.
 *
 * Supported transferables:
 *
 * - ArrayBuffer
 * - MessagePort
 * - ImageBitmap
 * - OffscreenCanvas
 *
 * Typed arrays and DataView are represented by their underlying
 * ArrayBuffer.
 *
 * SharedArrayBuffer is intentionally NOT supported.
 */

/**
 * Check whether a value is an ArrayBuffer.
 *
 * @param {any} value
 * @returns {boolean}
 */
function isArrayBuffer(value) {
	return typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;
}

/**
 * Check whether a value is a typed array.
 *
 * @param {any} value
 * @returns {boolean}
 */
function isTypedArray(value) {
	return (
		typeof ArrayBuffer !== "undefined" &&
		ArrayBuffer.isView(value) &&
		!(value instanceof DataView)
	);
}

/**
 * Check whether a value is a DataView.
 *
 * @param {any} value
 * @returns {boolean}
 */
function isDataView(value) {
	return typeof DataView !== "undefined" && value instanceof DataView;
}

/**
 * Check whether a value is a MessagePort.
 *
 * @param {any} value
 * @returns {boolean}
 */
function isMessagePort(value) {
	return typeof MessagePort !== "undefined" && value instanceof MessagePort;
}

/**
 * Check whether a value is an ImageBitmap.
 *
 * @param {any} value
 * @returns {boolean}
 */
function isImageBitmap(value) {
	return typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap;
}

/**
 * Check whether a value is an OffscreenCanvas.
 *
 * @param {any} value
 * @returns {boolean}
 */
function isOffscreenCanvas(value) {
	return (
		typeof OffscreenCanvas !== "undefined" && value instanceof OffscreenCanvas
	);
}

/**
 * Get the transferable representation of a value.
 *
 * @param {any} value
 * @returns {any|null}
 */
function getTransferable(value) {
	if (isArrayBuffer(value)) {
		return value;
	}

	if (isTypedArray(value) || isDataView(value)) {
		const buffer = value.buffer;

		return isArrayBuffer(buffer) ? buffer : null;
	}

	if (isMessagePort(value)) {
		return value;
	}

	if (isImageBitmap(value)) {
		return value;
	}

	if (isOffscreenCanvas(value)) {
		return value;
	}

	return null;
}

/**
 * Collect transferable objects from a value.
 *
 * Nested arrays and plain objects are traversed recursively.
 *
 * @param {any} value
 * @param {Set<any>} transferables
 * @param {Set<any>} visited
 */
function collectTransferables(value, transferables, visited) {
	const transferable = getTransferable(value);

	if (transferable) {
		transferables.add(transferable);

		return;
	}

	if (!value || typeof value !== "object") {
		return;
	}

	if (visited.has(value)) {
		return;
	}

	visited.add(value);

	if (Array.isArray(value)) {
		for (const item of value) {
			collectTransferables(item, transferables, visited);
		}

		return;
	}

	const prototype = Object.getPrototypeOf(value);

	if (prototype !== Object.prototype && prototype !== null) {
		return;
	}

	for (const item of Object.values(value)) {
		collectTransferables(item, transferables, visited);
	}
}

/**
 * Detect transferable objects contained in a value.
 *
 * @param {any} value
 * @returns {Array<any>}
 */
export function getTransferables(value) {
	const transferables = new Set();

	collectTransferables(value, transferables, new Set());

	return [...transferables];
}

/**
 * Merge automatically detected transferables with
 * explicitly supplied transferables.
 *
 * @param {any} value
 * @param {Array<any>} [explicit]
 * @returns {Array<any>}
 */
export function getTransferList(value, explicit = []) {
	const transferables = getTransferables(value);

	for (const transferable of explicit || []) {
		if (!transferables.includes(transferable)) {
			transferables.push(transferable);
		}
	}

	return transferables;
}
