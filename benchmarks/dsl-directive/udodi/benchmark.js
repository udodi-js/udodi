async function run() {
	while (typeof window.mountApplication !== "function") {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

	const samples = [];

	for (let i = 0; i < 30; i++) {
		const start = performance.now();
		const instance = window.mountApplication();
		samples.push(performance.now() - start);
		instance.unmount();
	}

	window.__benchmarkResults__ = { samples, unit: "ms", warmupCount: 0 };
}

run().catch((error) => {
	window.__benchmarkError__ =
		error instanceof Error ? error.message : String(error);
});
