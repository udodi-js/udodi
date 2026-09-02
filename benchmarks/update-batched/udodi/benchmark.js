const ROW_COUNT = 1000;
const BATCH_SIZE = 100;
const BATCH_COUNT = 100;
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

    for (let batch = 0; batch < WARMUP_COUNT; batch++) {
        for (let i = 0; i < BATCH_SIZE; i++) {
            app.update((batch * BATCH_SIZE + i) % ROW_COUNT);
        }
    }

    for (let batch = 0; batch < BATCH_COUNT; batch++) {
        const start = performance.now();

        for (let i = 0; i < BATCH_SIZE; i++) {
            app.update((batch * BATCH_SIZE + i) % ROW_COUNT);
        }

        samples.push(performance.now() - start);
    }

    app.destroy();

    window.__benchmarkResults__ = {
        samples,
        unit: "ms",
        warmupCount: WARMUP_COUNT,
        batchSize: BATCH_SIZE,
        batchCount: BATCH_COUNT,
        totalUpdates: BATCH_SIZE * BATCH_COUNT,
        perUpdateSamples: samples.map((sample) => sample / BATCH_SIZE),
    };
}

run().catch((error) => {
    window.__benchmarkError__ = error instanceof Error ? error.message : String(error);
});
