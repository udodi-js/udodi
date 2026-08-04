/**
 * Worker mutation module — simulates a server write.
 */
export async function query(context) {
	const { input, signal, stream, endStream } = context;

	if (signal.aborted) {
		throw new DOMException("Mutation execution was aborted.", "AbortError");
	}

	if (typeof stream === "function") {
		stream({ phase: "persist", id: input?.id ?? null });
	}

	await new Promise((resolve, reject) => {
		const t = setTimeout(resolve, 100);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(t);
				reject(
					new DOMException(
						"Mutation execution was aborted.",
						"AbortError",
					),
				);
			},
			{ once: true },
		);
	});

	endStream?.();

	return {
		saved: true,
		id: input?.id ?? null,
		name: input?.name ?? null,
		at: Date.now(),
	};
}
