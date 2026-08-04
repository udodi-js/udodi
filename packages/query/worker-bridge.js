import { createQueryModuleRegistry } from "./registry.js";
import { getTransferList } from "./transfer.js";

/**
 * Query Pool Worker Bridge.
 *
 * UI Thread
 *     │
 *     ▼
 * Worker Bridge
 *     │
 *     ▼
 * Main Worker
 *     │
 *     ▼
 * Compute Pool
 *     │
 *     ▼
 * Compute Worker
 *
 * The Main Worker owns the Compute Worker Pool.
 *
 * The Worker Bridge is responsible only for:
 *
 * - Main Worker lifecycle.
 * - Module synchronization.
 * - Request/response correlation.
 * - Cancellation forwarding.
 * - Stream event forwarding.
 * - Query input transport.
 *
 * Query input uses normal structured cloning by default.
 *
 * When input transfer is explicitly enabled, transferable objects
 * contained in the input are detected and transferred independently
 * at this Worker boundary.
 */

/**
 * Create a Query Pool Worker Bridge.
 *
 * @param {Object} [options]
 * @param {Object} [options.registry]
 * Query module registry.
 *
 * @param {number} [options.computeWorkers]
 * Number of Compute Workers managed by the Main Worker.
 *
 * @returns {Object}
 */
export function createQueryPoolWorkerBridge(options = {}) {
	const registry = options.registry || createQueryModuleRegistry();

	const worker = new Worker(
		new URL("./main.worker.js", import.meta.url),
		{
			type: "module",
		},
	);

	let initialized = false;

	let initializationPromise = null;

	let terminated = false;

	const pending = new Map();

	const syncedModules = new Map();

	let requestId = 0;

	/**
	 * Generate request ID.
	 *
	 * @returns {string}
	 */
	function createRequestId() {
		requestId++;

		return `query-pool-${requestId}`;
	}

	/**
	 * Deserialize a worker error.
	 *
	 * @param {Object} error
	 * @returns {Error}
	 */
	function deserializeError(error) {
		if (!error || typeof error !== "object") {
			return new Error("Query Pool Worker execution failed.");
		}

		const result = new Error(
			error.message || "Query Pool Worker execution failed.",
		);

		if (error.name) {
			result.name = error.name;
		}

		if (error.stack) {
			result.stack = error.stack;
		}

		return result;
	}

	/**
	 * Reject all pending requests.
	 *
	 * @param {Error} error
	 */
	function rejectPending(error) {
		for (const [id, request] of pending) {
			pending.delete(id);

			request.cleanup?.();

			request.reject(error);
		}
	}

	/**
	 * Validate a worker message.
	 *
	 * @param {any} message
	 * @returns {boolean}
	 */
	function isValidMessage(message) {
		return (
			message &&
			typeof message === "object" &&
			typeof message.id === "string" &&
			typeof message.type === "string"
		);
	}

	worker.addEventListener("message", (event) => {
		const message = event.data;

		if (!isValidMessage(message)) {
			return;
		}

		const request = pending.get(message.id);

		if (!request) {
			return;
		}

		switch (message.type) {
			case "stream-chunk":
				request.onChunk?.(message.chunk);

				break;

			case "stream-end":
				request.onStreamEnd?.();

				break;

			case "result": {
				pending.delete(message.id);

				request.cleanup?.();

				if (message.ok) {
					request.resolve(message.result);
				} else {
					request.reject(deserializeError(message.error));
				}

				break;
			}

			default:
				break;
		}
	});

	worker.addEventListener("error", (error) => {
		const workerError =
			error.error ||
			new Error(error.message || "[query-pool] Main Worker failed.");

		if (!initialized) {
			initializationPromise = null;
		}

		rejectPending(workerError);
	});

	worker.addEventListener("messageerror", () => {
		rejectPending(
			new Error("[query-pool] Failed to deserialize a Main Worker message."),
		);
	});

	/**
	 * Send a request to the Main Worker.
	 *
	 * When `transfer` is enabled, transferable objects contained
	 * in the message are detected and transferred at this boundary.
	 *
	 * Input transfer failures are intentionally not caught when
	 * transfer is enabled. The native Worker postMessage() error
	 * is allowed to propagate.
	 *
	 * @param {Object} message
	 * @param {AbortSignal} [signal]
	 * @param {Function} [onChunk]
	 * @param {Function} [onStreamEnd]
	 * @param {boolean} [transfer]
	 * @returns {Promise<any>}
	 */
	function request(message, signal, onChunk, onStreamEnd, transfer = false) {
		if (terminated) {
			return Promise.reject(
				new Error("[query-pool] Worker Bridge has been terminated."),
			);
		}

		const id = createRequestId();

		return new Promise((resolve, reject) => {
			let settled = false;

			let onAbort = null;

			const cleanup = () => {
				if (onAbort && signal) {
					signal.removeEventListener("abort", onAbort);

					onAbort = null;
				}
			};

			const settle = (callback, value) => {
				if (settled) {
					return;
				}

				settled = true;

				cleanup();

				callback(value);
			};

			pending.set(id, {
				resolve: (value) => {
					settle(resolve, value);
				},

				reject: (error) => {
					settle(reject, error);
				},

				onChunk,

				onStreamEnd,

				cleanup,
			});

			if (signal) {
				onAbort = () => {
					if (settled || terminated) {
						return;
					}

					try {
						worker.postMessage({
							type: "cancel",

							id,
						});
					} catch {
						/**
						 * The Worker error handler will reject
						 * pending requests if the Worker has failed.
						 */
					}
				};

				if (signal.aborted) {
					onAbort();
				} else {
					signal.addEventListener("abort", onAbort, {
						once: true,
					});
				}
			}

			const requestMessage = {
				...message,

				id,
			};

			/**
			 * Input transfer is explicitly opt-in.
			 *
			 * No transfer list is created when transfer is false.
			 * This preserves normal structured cloning.
			 *
			 * When transfer is true, the native postMessage()
			 * operation is intentionally not wrapped in a catch.
			 */
			if (transfer) {
				const transferList = getTransferList(requestMessage);

				worker.postMessage(requestMessage, transferList);

				return;
			}

			try {
				worker.postMessage(requestMessage);
			} catch (error) {
				pending.delete(id);

				cleanup();

				settled = true;

				reject(error);
			}
		});
	}

	/**
	 * Ensure the Main Worker and its Compute Worker Pool
	 * are initialized.
	 *
	 * @returns {Promise<void>}
	 */
	function ensureInitialized() {
		if (terminated) {
			return Promise.reject(
				new Error("[query-pool] Worker Bridge has been terminated."),
			);
		}

		if (initialized) {
			return Promise.resolve();
		}

		if (initializationPromise) {
			return initializationPromise;
		}

		initializationPromise = request({
			type: "initialize",

			options: {
				computeWorkers: options.computeWorkers,
			},
		})
			.then(() => {
				initialized = true;
			})
			.catch((error) => {
				initializationPromise = null;

				throw error;
			});

		return initializationPromise;
	}

	/**
	 * Synchronize a module descriptor.
	 *
	 * @param {Object} descriptor
	 * @returns {Promise<void>}
	 */
	async function syncModule(descriptor) {
		await ensureInitialized();

		const currentRevision = syncedModules.get(descriptor.key);

		if (currentRevision === descriptor.revision) {
			return;
		}

		await request({
			type: "register-module",

			module: descriptor,
		});

		syncedModules.set(descriptor.key, descriptor.revision);
	}

	/**
	 * Ensure a module is synchronized.
	 *
	 * @param {string} key
	 * @returns {Promise<Object>}
	 */
	async function ensureModule(key) {
		const descriptor = registry.get(key);

		if (!descriptor) {
			throw new Error(`[query-pool] Query module "${key}" is not registered.`);
		}

		await syncModule(descriptor);

		return descriptor;
	}

	/**
	 * Execute a query module.
	 *
	 * @param {Object} options
	 * @param {string} options.key
	 * Query key.
	 *
	 * @param {Object} options.module
	 * Registered query module descriptor.
	 *
	 * @param {any} [options.input]
	 * Query input.
	 *
	 * @param {boolean} [options.transfer]
	 * Transfer eligible objects contained in query input.
	 *
	 * @param {boolean} [options.stream]
	 * Enable streaming.
	 *
	 * @param {AbortSignal} [options.signal]
	 * Abort signal for query cancellation.
	 *
	 * @param {Function} [options.onChunk]
	 * Called for every streamed chunk.
	 *
	 * @param {Function} [options.onStreamEnd]
	 * Called when streaming completes.
	 *
	 * @returns {Promise<any>}
	 */
	async function execute({
		key,
		module,
		input,
		transfer = false,
		stream = false,
		signal,
		onChunk,
		onStreamEnd,
	}) {
		if (signal?.aborted) {
			throw new DOMException("Query execution was aborted.", "AbortError");
		}

		await ensureModule(module.key);

		return request(
			{
				type: "execute",

				key,

				module: module.key,

				revision: module.revision,

				input,

				transfer: transfer === true,

				stream,
			},

			signal,

			onChunk,

			onStreamEnd,

			transfer === true,
		);
	}

	/**
	 * Register a module and synchronize it with the Main Worker.
	 *
	 * @param {string} key
	 * @param {Object} definition
	 * @returns {Promise<Object>}
	 */
	async function registerModule(key, definition) {
		const descriptor = registry.register(key, definition);

		await syncModule(descriptor);

		return descriptor;
	}

	/**
	 * Invalidate a module in the Worker runtime.
	 *
	 * @param {string} key
	 * @returns {Promise<void>}
	 */
	async function invalidateModule(key) {
		await ensureInitialized();

		await request({
			type: "invalidate-module",

			module: key,
		});

		syncedModules.delete(key);
	}

	/**
	 * Terminate Worker resources.
	 */
	function terminate() {
		if (terminated) {
			return;
		}

		terminated = true;

		initialized = false;

		initializationPromise = null;

		rejectPending(new Error("[query-pool] Worker Bridge terminated."));

		syncedModules.clear();

		worker.terminate();
	}

	return {
		execute,

		registerModule,

		ensureModule,

		invalidateModule,

		terminate,

		registry,
	};
}
