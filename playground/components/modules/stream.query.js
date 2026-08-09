/**
 * Streaming worker query module.
 */
export async function query(context) {
	const { input, signal, stream, endStream } = context;
	const count = Math.min(20, Math.max(1, Number(input?.count) || 3));

	for (let i = 1; i <= count; i++) {
		if (signal.aborted) {
			throw new DOMException(
				"Query execution was aborted.",
				"AbortError",
			);
		}

		stream({ index: i, total: count, message: `chunk ${i}/${count}` });
		await new Promise((resolve) => setTimeout(resolve, 40));
	}

	endStream();

	return { done: true, count };
}
