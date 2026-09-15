const ROW_COUNT = 1000;
const WARMUP_COUNT = 10;
const samples = [];

async function waitForUpdateAPI() {
    while (typeof window.updateApplication !== "function") {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

async function run() {
    await waitForUpdateAPI();

    const app = window.updateApplication();

    for (let rowIndex = 0; rowIndex < WARMUP_COUNT; rowIndex++) {
        app.update(rowIndex);
    }

    for (let rowIndex = 0; rowIndex < ROW_COUNT; rowIndex++) {
        const start = performance.now();
        app.update(rowIndex);
        const end = performance.now();

        samples.push(end - start);
    }

    app.destroy();

    window.__benchmarkResults__ = {
        samples,
        unit: "ms",
        warmupCount: WARMUP_COUNT,
    };
}

run().catch((error) => {
    window.__benchmarkError__ = error instanceof Error ? error.message : String(error);
});
