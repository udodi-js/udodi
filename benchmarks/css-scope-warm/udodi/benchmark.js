const SAMPLE_COUNT = 30;
const WARMUP_COUNT = 1;
const samples = [];

async function waitForMountAPI() {
    while (typeof window.mountApplication !== "function") {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

async function run() {
    await waitForMountAPI();

    for (let i = 0; i < WARMUP_COUNT; i++) {
        const instance = window.mountApplication();
        instance.unmount();
    }

    for (let i = 0; i < SAMPLE_COUNT; i++) {
        const start = performance.now();
        const instance = window.mountApplication();
        const end = performance.now();

        samples.push(end - start);
        instance.unmount();
    }

    window.__benchmarkResults__ = {
        samples,
        unit: "ms",
        warmupCount: WARMUP_COUNT,
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
