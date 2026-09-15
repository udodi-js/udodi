async function run() {
    while (typeof window.mountApplication !== "function") {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const start = performance.now();
    const instance = window.mountApplication();
    const end = performance.now();

    instance.unmount();
    window.__benchmarkResults__ = {
        samples: [end - start],
        unit: "ms",
        warmupCount: 0,
        workload: {
            componentCount: 100,
            selectorsPerComponent: 50,
            totalSelectors: 5000,
            declarationsPerSelector: 2,
            totalDeclarations: 10000,
        },
    };
}

run().catch((error) => {
    window.__benchmarkError__ = error instanceof Error ? error.message : String(error);
});
