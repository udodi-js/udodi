import { createComputePool } from "./compute-pool.js";
import { getTransferList } from "./transfer.js";

/**
 * Main Worker for the Udodi Query Pool.
 *
 * Responsibilities:
 *
 * - Maintain worker-side module descriptors.
 * - Track query execution lifecycle.
 * - Route execution requests.
 * - Manage Compute Worker Pool.
 * - Forward query input.
 * - Forward streamed chunks.
 * - Forward cancellation.
 * - Invalidate worker module caches.
 *
 * The Main Worker does not execute query functions.
 *
 * Worker execution is a single logical query execution.
 *
 * Query input uses normal structured cloning by default.
 *
 * When input transfer is explicitly enabled, transferable objects
 * contained in the input are detected and transferred independently
 * at the Main Worker → Compute Worker boundary.
 */

const modules = new Map();
const executions = new Map();

let computePool = null;

/**
 * Initialize the Compute Worker Pool.
 *
 * @param {Object} [options]
 */
function initializeComputePool(options = {}) {
	if (computePool) {
		return;
	}

	computePool = createComputePool({
		size: options.computeWorkers,
	});
}

/**
 * Lazily initialize with defaults.
 *
 * @returns {Object}
 */
function getComputePool() {
	if (!computePool) {
		initializeComputePool();
	}

	return computePool;
}

/**
 * Serialize an error.
 *
 * @param {any} error
 * @returns {Object}
 */
function serializeError(error) {
	return {
		name: error?.name || "Error",
		message: error?.message || String(error),
		stack: error?.stack || null,
	};
}

/**
 * Create an AbortError.
 *
 * @returns {Error}
 */
function createAbortError() {
	return new DOMException("Query execution was aborted.", "AbortError");
}

/**
 * Post a successful response.
 *
 * Transferable objects contained in the result are detected
 * automatically before crossing the Main Worker boundary.
 *
 * @param {string} id
 * @param {any} result
 */
function postSuccess(id, result) {
	const message = {
		type: "result",
		id,
		ok: true,
		result,
	};

	const transfer = getTransferList(message);

	if (transfer.length > 0) {
		postMessage(message, transfer);

		return;
	}

	postMessage(message);
}

/**
 * Post an error response.
 *
 * @param {string} id
 * @param {any} error
 */
function postFailure(id, error) {
	postMessage({
		type: "result",
		id,
		ok: false,
		error: serializeError(error),
	});
}

/**
 * Post a streamed chunk.
 *
 * Transferable objects are detected independently at this
 * Worker boundary.
 *
 * @param {string} id
 * @param {any} chunk
 */
function postStreamChunk(id, chunk) {
	const message = {
		type: "stream-chunk",
		id,
		chunk,
	};

	const transfer = getTransferList(message);

	if (transfer.length > 0) {
		postMessage(message, transfer);

		return;
	}

	postMessage(message);
}

/**
 * Post stream completion.
 *
 * @param {string} id
 */
function postStreamEnd(id) {
	postMessage({
		type: "stream-end",
		id,
	});
}

/**
 * Register a module descriptor.
 *
 * @param {Object} message
 */
function registerModule(message) {
	const descriptor = message.module;

	if (!descriptor || typeof descriptor.key !== "string") {
		throw new Error("[query-pool] Invalid query module descriptor.");
	}

	const previous = modules.get(descriptor.key);

	modules.set(descriptor.key, descriptor);

	if (
		!previous ||
		previous.revision !== descriptor.revision ||
		previous.url !== descriptor.url
	) {
		getComputePool().invalidateModule(descriptor.key);
	}

	postSuccess(message.id, true);
}

/**
 * Create an execution record.
 *
 * @param {string} id
 * @returns {Object}
 */
function createExecution(id) {
	const execution = {
		id,
		cancelled: false,
		active: true,
		streamEnded: false,
	};

	executions.set(id, execution);

	return execution;
}

/**
 * Remove an execution record.
 *
 * @param {string} id
 */
function cleanupExecution(id) {
	executions.delete(id);
}

/**
 * Cancel an execution.
 *
 * @param {string} id
 * @returns {boolean}
 */
function cancelExecution(id) {
	const execution = executions.get(id);

	if (!execution) {
		return false;
	}

	if (execution.cancelled) {
		return true;
	}

	execution.cancelled = true;

	getComputePool().cancel(id);

	return true;
}

/**
 * Execute a query module.
 *
 * Worker source and compute are intentionally unified
 * into one Compute Worker task.
 *
 * @param {Object} message
 * @returns {Promise<any>}
 */
async function execute(message) {
	const descriptor = modules.get(message.module);

	if (!descriptor) {
		throw new Error(
			`[query-pool] Query module "${message.module}" is not registered in the Main Worker.`,
		);
	}

	const execution = createExecution(message.id);

	const context = {
		queryKey: message.key,
		moduleKey: descriptor.key,
	};

	try {
		if (execution.cancelled) {
			throw createAbortError();
		}

		return await getComputePool().execute({
			id: execution.id,

			module: descriptor,

			input: message.input,

			transfer: message.transfer === true,

			stream: message.stream === true,

			context,

			onChunk(chunk) {
				if (execution.cancelled || !execution.active) {
					return;
				}

				postStreamChunk(execution.id, chunk);
			},

			onStreamEnd() {
				if (execution.cancelled || !execution.active) {
					return;
				}

				if (execution.streamEnded) {
					return;
				}

				execution.streamEnded = true;

				postStreamEnd(execution.id);
			},
		});
		
	} finally {
		execution.active = false;

		cleanupExecution(execution.id);
	}
}

/**
 * Handle Main Worker messages.
 */
self.addEventListener("message", (event) => {
	const message = event.data;

	if (!message || typeof message !== "object") {
		return;
	}

	(async () => {
		try {
			switch (message.type) {
				case "initialize":
					initializeComputePool(message.options);

					postSuccess(message.id, true);

					break;

				case "register-module":
					registerModule(message);

					break;

				case "invalidate-module":
					getComputePool().invalidateModule(message.module);

					postSuccess(message.id, true);

					break;

				case "execute": {
					const result = await execute(message);

					postSuccess(message.id, result);

					break;
				}

				case "cancel":
					cancelExecution(message.id);

					break;

				default:
					break;
			}

		} catch (error) {
			if (message.id) {
				postFailure(message.id, error);
			}
		}
	})();
});
