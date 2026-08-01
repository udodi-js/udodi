import { getTransferList } from "./transfer.js";

/**
 * Udodi Query Pool Compute Worker.
 *
 * Responsibilities:
 *
 * - Dynamically import query modules.
 * - Cache imported modules.
 * - Resolve unified query export.
 * - Execute query operations.
 * - Stream intermediate data.
 * - Detect Transferable Objects.
 * - Maintain task AbortControllers.
 * - Cancel active operations.
 * - Invalidate module cache entries.
 *
 * Worker query modules expose:
 *
 *     export async function query(context) {}
 *
 * The context provides:
 *
 *     context.input
 *     context.signal
 *     context.stream(chunk)
 *     context.endStream()
 */

const moduleCache = new Map();

const tasks = new Map();

function serializeError(error) {
	return {
		name: error?.name || "Error",

		message: error?.message || String(error),

		stack: error?.stack || null,
	};
}

function createAbortError() {
	return new DOMException("Query execution was aborted.", "AbortError");
}

async function loadModule(descriptor) {
	const cached = moduleCache.get(descriptor.key);

	if (
		cached &&
		cached.revision === descriptor.revision &&
		cached.url === descriptor.url
	) {
		return cached.module;
	}

	const module = await import(descriptor.url);

	moduleCache.set(descriptor.key, {
		revision: descriptor.revision,

		url: descriptor.url,

		module,
	});

	return module;
}

function resolveQueryExport(module, descriptor) {
	const exportName = descriptor.queryExport || "query";

	const named = module[exportName];

	if (typeof named === "function") {
		return named;
	}

	const defaultExport = module.default;

	if (defaultExport && typeof defaultExport === "object") {
		const defaultFunction = defaultExport[exportName];

		if (typeof defaultFunction === "function") {
			return defaultFunction;
		}
	}

	if (descriptor.defaultExport) {
		const configured = module[descriptor.defaultExport];

		if (configured && typeof configured === "object") {
			const configuredFunction = configured[exportName];

			if (typeof configuredFunction === "function") {
				return configuredFunction;
			}
		}
	}

	return undefined;
}

/**
 * Post a message using automatically detected
 * transferable objects.
 *
 * @param {Object} message
 */
function postTransferableMessage(message) {
	const transfer = getTransferList(message);

	if (transfer.length > 0) {
		postMessage(message, transfer);

		return;
	}

	postMessage(message);
}

/**
 * Post a streamed chunk.
 *
 * @param {string} id
 * @param {any} chunk
 */
function postStreamChunk(id, chunk) {
	postTransferableMessage({
		type: "stream-chunk",
		id,
		chunk,
	});
}

/**
 * Execute a query.
 *
 * @param {Object} message
 * @param {AbortSignal} signal
 * @param {Object} task
 * @returns {Promise<any>}
 */
async function executeTask(message, signal, task) {
	const descriptor = message.module;

	const module = await loadModule(descriptor);

	if (signal.aborted) {
		throw createAbortError();
	}

	const handler = resolveQueryExport(module, descriptor);

	if (!handler) {
		throw new Error(
			`[query-pool] Module "${descriptor.key}" does not export "${descriptor.queryExport || "query"}".`,
		);
	}

	let streamEnded = false;

	function stream(chunk) {
		if (!message.stream) {
			throw new Error("[query-pool] Streaming is not enabled for this query.");
		}

		if (signal.aborted) {
			throw createAbortError();
		}

		if (streamEnded) {
			throw new Error(
				"[query-pool] Cannot stream data after endStream() has been called.",
			);
		}

		postStreamChunk(message.id, chunk);
	}

	function endStream() {
		if (!message.stream) {
			throw new Error("[query-pool] Streaming is not enabled for this query.");
		}

		if (streamEnded) {
			return;
		}

		if (signal.aborted) {
			return;
		}

		streamEnded = true;

		postMessage({
			type: "stream-end",
			id: message.id,
		});
	}

	task.stream = stream;

	task.endStream = endStream;

	const context = {
		...(message.context || {}),

		input: message.input,

		moduleKey: descriptor.key,

		signal,

		stream,

		endStream,
	};

	return handler(context);
}

async function handleExecute(message) {
	const controller = new AbortController();

	const task = {
		controller,

		executionId: message.executionId || null,

		stream: null,

		endStream: null,
	};

	tasks.set(message.id, task);

	try {
		const result = await executeTask(message, controller.signal, task);

		if (controller.signal.aborted) {
			throw createAbortError();
		}

		postTransferableMessage({
			type: "result",

			id: message.id,

			ok: true,

			result,
		});

	} catch (error) {
		if (controller.signal.aborted) {
			postMessage({
				type: "result",

				id: message.id,

				ok: false,

				error: serializeError(createAbortError()),
			});

			return;
		}

		postMessage({
			type: "result",

			id: message.id,

			ok: false,

			error: serializeError(error),
		});
		
	} finally {
		tasks.delete(message.id);
	}
}

function cancelTask(id) {
	const task = tasks.get(id);

	if (!task) {
		return;
	}

	task.controller.abort();
}

function invalidateModule(key) {
	moduleCache.delete(key);
}

self.addEventListener("message", (event) => {
	const message = event.data;

	if (!message || typeof message !== "object") {
		return;
	}

	switch (message.type) {
		case "execute":
			handleExecute(message);

			break;

		case "cancel":
			cancelTask(message.id);

			break;

		case "invalidate-module":
			invalidateModule(message.module);

			break;

		default:
			break;
	}
});
