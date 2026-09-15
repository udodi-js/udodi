/**
 * Heap benchmark: repeated mount/unmount cycles to detect retention leaks.
 *
 * Workload:
 * - 1,000 records with five scalar fields and one small array field
 * - mount all records
 * - perform 1,000 single-row immutable updates
 * - unmount the application
 * - repeat this lifecycle 10 times and record the heap at each checkpoint
 *
 * Measurements use V8 used heap after GC at each lifecycle checkpoint.
 */

const CYCLE_COUNT = 10;
const UPDATE_COUNT = 1000;

function mean(values) {
	if (values.length === 0) {
		return 0;
	}

	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
	if (values.length === 0) {
		return 0;
	}

	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);

	if (sorted.length % 2 === 0) {
		return (sorted[mid - 1] + sorted[mid]) / 2;
	}

	return sorted[mid];
}

function calculateSlope(values) {
	if (values.length < 2) {
		return 0;
	}

	const n = values.length;
	let sumX = 0;
	let sumY = 0;
	let sumXY = 0;
	let sumXX = 0;

	for (let i = 0; i < n; i++) {
		sumX += i;
		sumY += values[i];
		sumXY += i * values[i];
		sumXX += i * i;
	}

	const denominator = n * sumXX - sumX * sumX;

	if (denominator === 0) {
		return 0;
	}

	return (n * sumXY - sumX * sumY) / denominator;
}

async function forceGC() {
	if (window.gc) {
		window.gc();

		// allow GC to complete
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

async function getHeap() {
	if (window.getV8HeapUsage) {
		return window.getV8HeapUsage();
	}

	if (performance.memory) {
		return performance.memory.usedJSHeapSize;
	}

	throw new Error("Heap measurement unavailable");
}

async function waitForAppFactory() {
	await new Promise((resolve) => {
		const check = () => {
			if (typeof window.createApplication === "function") {
				resolve();
				return;
			}

			setTimeout(check, 0);
		};

		check();
	});
}

async function runCycle(cycleIndex) {
	await waitForAppFactory();

	await forceGC();
	const before = await getHeap();

	const app = window.createApplication();

	await forceGC();
	const afterMount = await getHeap();

	for (let i = 0; i < UPDATE_COUNT; i++) {
		app.update(i);
	}

	await forceGC();
	const afterUpdate = await getHeap();

	app.destroy();

	await forceGC();
	const afterDestroy = await getHeap();

	return {
		cycle: cycleIndex + 1,
		before,
		afterMount,
		afterUpdate,
		afterDestroy,
		metrics: {
			mountIncrease: afterMount - before,
			updateIncrease: afterUpdate - afterMount,
			retained: afterDestroy - before,
			retainedAfterUpdate: afterUpdate - before,
		},
	};
}

async function run() {
	const cycles = [];

	for (let cycle = 0; cycle < CYCLE_COUNT; cycle++) {
		cycles.push(await runCycle(cycle));
	}

	const retainedSeries = cycles.map((entry) => entry.metrics.retained);
	const afterMountSeries = cycles.map((entry) => entry.afterMount);
	const afterUpdateSeries = cycles.map((entry) => entry.afterUpdate);
	const afterDestroySeries = cycles.map((entry) => entry.afterDestroy);
	const mountIncreaseSeries = cycles.map((entry) => entry.metrics.mountIncrease);
	const updateIncreaseSeries = cycles.map((entry) => entry.metrics.updateIncrease);
	const warmRetainedSeries = retainedSeries.slice(1);
	const warmUpdateIncreaseSeries = updateIncreaseSeries.slice(1);
	const retainedTrend = calculateSlope(retainedSeries);
	const warmRetainedTrend = calculateSlope(warmRetainedSeries);
	const warmRetainedMedian = median(warmRetainedSeries);
	const warmUpdateMedian = median(warmUpdateIncreaseSeries);
	const leakLikely =
		warmRetainedSeries.length > 0 &&
		warmRetainedTrend > 500 &&
		retainedSeries.at(-1) > 2000 &&
		warmRetainedSeries.every((value) => value >= 0);

	const results = {
		iterations: CYCLE_COUNT,
		updateCount: UPDATE_COUNT,
		cycles,
		metrics: {
			coldCycle: {
				updateIncrease: updateIncreaseSeries[0],
				retained: retainedSeries[0],
				afterDestroy: afterDestroySeries[0],
			},
			steadyState: {
				medianUpdateIncrease: warmUpdateMedian,
				medianRetained: warmRetainedMedian,
				meanRetained: mean(warmRetainedSeries),
				peakRetained: Math.max(...warmRetainedSeries),
			},
			mount: {
				medianDelta: median(mountIncreaseSeries),
				averageDelta: mean(mountIncreaseSeries),
				minDelta: Math.min(...mountIncreaseSeries),
				maxDelta: Math.max(...mountIncreaseSeries),
			},
			retention: {
				startingRetained: retainedSeries[0],
				endingRetained: retainedSeries.at(-1),
				trendBytesPerCycle: retainedTrend,
				warmTrendBytesPerCycle: warmRetainedTrend,
				peakRetained: Math.max(...retainedSeries),
				leakLikely,
			},
		},
	};

	window.__benchmarkResults__ = results;
}

run().catch((error) => {
	window.__benchmarkError__ = error instanceof Error ? error.message : String(error);
});
