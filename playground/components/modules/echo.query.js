/**
 * Worker query module — echo input back to the UI thread.
 */
export async function query(context) {
	const { input, signal } = context;

	if (signal.aborted) {
		throw new DOMException("Query execution was aborted.", "AbortError");
	}

	// Small delay so loading / cancel is observable in the playground.
	await new Promise((resolve, reject) => {
		const t = setTimeout(resolve, 60);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(t);
				reject(
					new DOMException(
						"Query execution was aborted.",
						"AbortError",
					),
				);
			},
			{ once: true },
		);
	});

	return {
		echo: input ?? null,
		from: "compute-worker",
		at: Date.now(),
	};
}
