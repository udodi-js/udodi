import {
	EXPRESSIONS,
	compileExpression,
	createDSLContext,
} from "../../fixtures/dsl.js";

import { VM } from "../../../packages/core/vm.js";

const context = createDSLContext();
const vm = new VM(context);

const expressions = EXPRESSIONS.map(
	(expression) => compileExpression(expression)[0].expr,
);

const samples = [];
const BATCH_SIZE = 10_000;
const BATCH_COUNT = 100;
const WARMUP_COUNT = 10;

window.runBenchmark = () => {
	for (let i = 0; i < WARMUP_COUNT; i++) {
		vm.evaluate(expressions[i % expressions.length], context);
    }

	for (let batch = 0; batch < BATCH_COUNT; batch++) {
		const start = performance.now();
		for (let i = 0; i < BATCH_SIZE; i++) {
			vm.evaluate(expressions[(batch * BATCH_SIZE + i) % expressions.length], context);
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
	};
};

window.runBenchmark();
