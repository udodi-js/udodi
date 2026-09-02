import {
	launchBrowser,
	runBenchmark,
	closeBrowser,
	getBrowserMetadata,
} from "./browser.js";
import { benchmarkConfig } from "./config.js";
import { summarize } from "./statistics.js";
import { writeReport } from "./reporter.js";

const browser = await launchBrowser();

try {
	for (const [framework, frameworkConfig] of Object.entries(
		benchmarkConfig.frameworks,
	)) {
		for (const benchmarkConfigEntry of frameworkConfig.benchmarks) {
			const benchmark = benchmarkConfigEntry.name;
			const url = `${benchmarkConfig.baseUrl}/${benchmarkConfigEntry.path}/${framework}/`;
			const rawResults = [];

			for (let run = 0; run < (benchmarkConfigEntry.runs ?? 1); run++) {
				rawResults.push(await runBenchmark(browser, url));
			}

			const rawResult = rawResults[0].samples
				? {
						...rawResults[0],
						samples: rawResults.flatMap((result) => result.samples),
						warmupCount: rawResults.reduce(
							(count, result) => count + (result.warmupCount ?? 0),
							0,
						),
					}
				: rawResults[0];
			const isTimingBenchmark = Array.isArray(rawResult.samples);
			const perOperationSamples =
				rawResult.perOperationSamples ?? rawResult.perUpdateSamples;
			const benchmarkInfo = {
				name: benchmark,
				unit: isTimingBenchmark ? rawResult.unit : "bytes",
			};
			const result = rawResult.samples
				? {
						samples: rawResult.samples,
						...(rawResult.batchSize
							? {
									batchSize: rawResult.batchSize,
									batchCount: rawResult.batchCount,
									totalOperations: rawResult.totalOperations,
									perOperationSamples,
									perOperationStatistics: summarize(perOperationSamples),
								}
							: {}),
						statistics: summarize(rawResult.samples),
					}
				: (() => {
						const { iterations, ...measurements } = rawResult;
						return { measurements };
					})();
			const environment = {
				...getBrowserMetadata(browser),
				iterations: isTimingBenchmark
					? rawResult.samples.length
					: rawResult.iterations,
				warmupIterations: rawResult.warmupCount ?? 0,
			};
			const outputPath = await writeReport({
				framework: {
					name: frameworkConfig.displayName,
					version: frameworkConfig.version,
				},
				benchmark: benchmarkInfo,
				environment,
				result,
			});

			console.log(`${frameworkConfig.displayName} ${benchmark}: ${outputPath}`);
			console.dir(result, { depth: null });
		}
	}
    
} finally {
	await closeBrowser(browser);
}
