import { EXPRESSIONS, compileExpression } from "../../fixtures/dsl.js";

const cache = new Map();

const getOrCompile = (expression) => {
	let instructions = cache.get(expression);
	if (!instructions) {
		instructions = compileExpression(expression);
		cache.set(expression, instructions);
	}
	return instructions;
};

const samples = [];
const BATCH_SIZE = 10_000;
const BATCH_COUNT = 100;
const WARMUP_COUNT = 10;

window.runBenchmark = () => {
	EXPRESSIONS.forEach(getOrCompile);
    
	for (let i = 0; i < WARMUP_COUNT; i++) {
		getOrCompile(EXPRESSIONS[i % EXPRESSIONS.length]);
	}

	for (let batch = 0; batch < BATCH_COUNT; batch++) {
		const start = performance.now();
		for (let i = 0; i < BATCH_SIZE; i++) {
			getOrCompile(EXPRESSIONS[(batch * BATCH_SIZE + i) % EXPRESSIONS.length]);
		}
		samples.push(performance.now() - start);
	}

	window.__benchmarkResults__ = {
		samples,
		unit: "ms",
		warmupCount: WARMUP_COUNT,
		batchSize: BATCH_SIZE,
		batchCount: BATCH_COUNT,
		totalOperations: BATCH_SIZE * BATCH_COUNT,
		perOperationSamples: samples.map((sample) => sample / BATCH_SIZE),
		cacheSize: cache.size,
	};
};

window.runBenchmark();
