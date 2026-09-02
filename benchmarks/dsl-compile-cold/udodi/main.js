import { EXPRESSIONS, compileExpression } from "../../fixtures/dsl.js";

const samples = [];
const BATCH_SIZE = 10_000;
const BATCH_COUNT = 100;

window.runBenchmark = () => {
	for (let batch = 0; batch < BATCH_COUNT; batch++) {
		const start = performance.now();
		for (let i = 0; i < BATCH_SIZE; i++) {
			compileExpression(EXPRESSIONS[(batch * BATCH_SIZE + i) % EXPRESSIONS.length]);
		}
		samples.push(performance.now() - start);
	}

	window.__benchmarkResults__ = {
		samples,
		unit: "ms",
		warmupCount: 0,
		batchSize: BATCH_SIZE,
		batchCount: BATCH_COUNT,
		totalOperations: BATCH_SIZE * BATCH_COUNT,
		perOperationSamples: samples.map((sample) => sample / BATCH_SIZE),
	};
};

window.runBenchmark();
