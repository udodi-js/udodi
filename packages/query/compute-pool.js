import { getTransferList } from "./transfer.js";

/**
 * Compute Worker Pool.
 *
 * Manages Compute Workers.
 *
 * Responsibilities:
 *
 * - Worker lifecycle.
 * - Worker selection.
 * - Task IDs.
 * - In-flight task tracking.
 * - Query input transport.
 * - Streaming chunk forwarding.
 * - Cancellation.
 * - Worker failure handling.
 * - Worker replacement after failure.
 * - Module cache invalidation.
 */

/**
 * Create a Compute Worker Pool.
 *
 * @param {Object} [options]
 * @param {number} [options.size]
 * @param {string|URL} [options.worker]
 * @returns {Object}
 */
export function createComputePool(options = {}) {
	function getDefaultSize() {
		if (typeof navigator === "undefined" || !navigator.hardwareConcurrency) {
			return 1;
		}

		return Math.max(1, navigator.hardwareConcurrency - 1);
	}

	const size = Math.max(1, Math.floor(options.size || getDefaultSize()));

	const workerUrl =
		options.worker ||
		new URL("./query-pool-compute.worker.js", import.meta.url);

	const workers = [];

	const pending = new Map();

	const executions = new Map();

	let taskSequence = 0;

	let cursor = 0;

	let terminated = false;

	function createTaskId() {
		taskSequence++;

		return `compute-${taskSequence}`;
	}

	function createWorker() {
		const worker = new Worker(workerUrl, {
			type: "module",
		});

		const entry = {
			worker,

			busy: 0,

			tasks: new Set(),

			failed: false,
		};

		worker.addEventListener("message", (event) => {
			handleMessage(entry, event.data);
		});

		worker.addEventListener("error", (error) => {
			handleWorkerError(entry, error);
		});

		worker.addEventListener("messageerror", () => {
			handleWorkerError(
				entry,
				new Error("[query-pool] Failed to deserialize Compute Worker message."),
			);
		});

		return entry;
	}

	function removeExecutionTask(task) {
		if (!task.executionId) {
			return;
		}

		const taskIds = executions.get(task.executionId);

		if (!taskIds) {
			return;
		}

		taskIds.delete(task.id);

		if (taskIds.size === 0) {
			executions.delete(task.executionId);
		}
	}

	function finalizeTask(entry, taskId) {
		const task = pending.get(taskId);

		if (!task) {
			return null;
		}

		pending.delete(taskId);

		entry.tasks.delete(taskId);

		entry.busy = Math.max(0, entry.busy - 1);

		removeExecutionTask(task);

		return task;
	}

	function handleMessage(entry, message) {
		if (entry.failed) {
			return;
		}

		const taskId = message?.id;

		if (!taskId) {
			return;
		}

		const task = pending.get(taskId);

		if (!task) {
			return;
		}

		switch (message.type) {
			case "stream-chunk":
				task.onChunk?.(message.chunk);

				break;

			case "stream-end":
				task.onStreamEnd?.();

				break;

			case "result": {
				const finalized = finalizeTask(entry, taskId);

				if (!finalized) {
					return;
				}

				if (message.ok) {
					finalized.resolve(message.result);

					return;
				}

				const error = new Error(
					message.error?.message || "Compute Worker execution failed.",
				);

				error.name = message.error?.name || "Error";

				if (message.error?.stack) {
					error.stack = message.error.stack;
				}

				finalized.reject(error);

				break;
			}

			default:
				break;
		}
	}

	function replaceWorker(entry) {
		if (terminated) {
			return;
		}

		const index = workers.indexOf(entry);

		if (index === -1) {
			return;
		}

		workers.splice(index, 1);

		const replacement = createWorker();

		workers.splice(index, 0, replacement);

		if (workers.length > 0) {
			cursor %= workers.length;
		} else {
			cursor = 0;
		}
	}

	function handleWorkerError(entry, error) {
		if (entry.failed) {
			return;
		}

		entry.failed = true;

		const workerError =
			error?.error || new Error(error?.message || "Compute Worker failed.");

		for (const taskId of [...entry.tasks]) {
			const task = finalizeTask(entry, taskId);

			if (!task) {
				continue;
			}

			task.reject(workerError);
		}

		replaceWorker(entry);

		try {
			entry.worker.terminate();
		} catch {
			/**
			 * The Worker is already unavailable.
			 */
		}
	}

	function selectWorker() {
		let selected = null;

		for (let index = 0; index < workers.length; index++) {
			const workerIndex = (cursor + index) % workers.length;

			const entry = workers[workerIndex];

			if (entry.failed) {
				continue;
			}

			if (!selected || entry.busy < selected.busy) {
				selected = entry;
			}
		}

		if (!selected) {
			throw new Error("[query-pool] No healthy Compute Worker is available.");
		}

		cursor = (cursor + 1) % workers.length;

		return selected;
	}

	function initialize() {
		if (terminated || workers.length > 0) {
			return;
		}

		for (let index = 0; index < size; index++) {
			workers.push(createWorker());
		}
	}

	/**
	 * Execute a Worker task.
	 *
	 * Query input uses normal structured cloning by default.
	 *
	 * When `transfer` is true, the Compute Worker receives the input
	 * using a transfer list automatically detected by the Compute Worker
	 * transport layer.
	 *
	 * @param {Object} task
	 * @param {string} [task.id]
	 * @param {Object} task.module
	 * @param {any} [task.input]
	 * @param {boolean} [task.transfer]
	 * @param {boolean} [task.stream]
	 * @param {Object} task.context
	 * @param {Function} [task.onChunk]
	 * @param {Function} [task.onStreamEnd]
	 * @returns {Promise<any>}
	 */
	function execute(task) {
		if (terminated) {
			return Promise.reject(
				new Error("[query-pool] Compute Worker Pool has been terminated."),
			);
		}

		initialize();

		const taskId = createTaskId();

		const executionId = task.id || null;

		const entry = selectWorker();

		return new Promise((resolve, reject) => {
			const pendingTask = {
				id: taskId,

				executionId,

				resolve,

				reject,

				onChunk: task.onChunk,

				onStreamEnd: task.onStreamEnd,

				worker: entry,
			};

			pending.set(taskId, pendingTask);

			entry.tasks.add(taskId);

			entry.busy++;

			if (executionId) {
				let taskIds = executions.get(executionId);

				if (!taskIds) {
					taskIds = new Set();

					executions.set(executionId, taskIds);
				}

				taskIds.add(taskId);
			}

			const message = {
				type: "execute",

				id: taskId,

				executionId,

				module: task.module,

				input: task.input,

				transfer: task.transfer === true,

				stream: task.stream === true,

				context: task.context,
			};

			/**
			 * When transfer is enabled, the Compute Worker receives
			 * the input using the transfer list generated by its own
			 * transport boundary.
			 *
			 * Do not catch postMessage() here when transfer is enabled.
			 * Native transfer errors are intentionally allowed to
			 * propagate to the caller.
			 */
			if (task.transfer === true) {
				const transfer = getTransferList(message);
				entry.worker.postMessage(message, transfer);

				return;
			}

			try {
				entry.worker.postMessage(message);

			} catch (error) {
				const failed = finalizeTask(entry, taskId);

				if (failed) {
					failed.reject(error);
				}
			}
		});
	}

	function cancel(executionId) {
		const taskIds = executions.get(executionId);

		if (!taskIds || taskIds.size === 0) {
			return false;
		}

		for (const taskId of taskIds) {
			const task = pending.get(taskId);

			if (!task) {
				continue;
			}

			if (task.worker.failed) {
				continue;
			}

			try {
				task.worker.worker.postMessage({
					type: "cancel",

					id: taskId,
				});
			} catch {
				/**
				 * A Worker failure event will remove and
				 * replace the Worker if it has become unavailable.
				 */
			}
		}

		return true;
	}

	function invalidateModule(moduleKey) {
		for (const entry of workers) {
			if (entry.failed) {
				continue;
			}

			try {
				entry.worker.postMessage({
					type: "invalidate-module",

					module: moduleKey,
				});
			} catch {
				/**
				 * A Worker failure event will remove and
				 * replace
				 * the Worker if it has become unavailable.
				 */
			}
		}
	}

	function terminate() {
		if (terminated) {
			return;
		}

		terminated = true;

		for (const entry of workers) {
			entry.failed = true;

			entry.worker.terminate();
		}

		workers.length = 0;

		for (const [id, task] of pending) {
			pending.delete(id);

			task.reject(new Error("[query-pool] Compute Worker Pool terminated."));
		}

		executions.clear();
	}

	return {
		execute,

		cancel,

		invalidateModule,

		terminate,

		get size() {
			return size;
		},
	};
}
