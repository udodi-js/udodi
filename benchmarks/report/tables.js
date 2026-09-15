export function formatTime(value) {
	const numericValue = Number(value) || 0;
	return `${numericValue.toFixed(2)} ms`;
}

export function formatDuration(value) {
	const numericValue = Number(value) || 0;
	const absValue = Math.abs(numericValue);

	if (absValue < 0.001) {
		return `${(numericValue * 1_000_000).toFixed(2)} µs`;
	}

	if (absValue < 1) {
		return `${(numericValue * 1_000).toFixed(2)} µs`;
	}

	return `${numericValue.toFixed(2)} ms`;
}

export function formatBytes(value) {
	const numericValue = Number(value) || 0;
	const absValue = Math.abs(numericValue);

	if (absValue < 1024) {
		return `${numericValue.toFixed(0)} B`;
	}

	if (absValue < 1024 * 1024) {
		return `${(numericValue / 1024).toFixed(2)} KB`;
	}

	return `${(numericValue / (1024 * 1024)).toFixed(2)} MB`;
}

export function createMarkdownTable(headers, rows) {
	const headerRow = `| ${headers.join(" | ")} |`;
	const dividerRow = `| ${headers.map(() => "---").join(" | ")} |`;
	const bodyRows = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");

	return [headerRow, dividerRow, bodyRows].join("\n");
}

export function createTimingTable(result, operations = "") {
	const stats = result.statistics ?? result.measurements?.statistics ?? {};
	const frameworkName = result.framework?.name ?? "Unknown";
	const frameworkVersion = result.framework?.version ?? "unknown";
	const warmup = result.environment?.warmupIterations ?? result.warmupCount ?? "";

	return createMarkdownTable(
		[
			"Framework",
			"Version",
			"Operations",
			"Warmup",
			"Mean",
			"Median",
			"Min",
			"Max",
			"Std Dev",
			"P95",
			"P99",
		],
		[[
			frameworkName,
			frameworkVersion,
			operations,
			warmup === "" ? "" : `${warmup} iterations`,
			formatTime(stats.mean),
			formatTime(stats.median),
			formatTime(stats.min),
			formatTime(stats.max),
			formatTime(stats.stdDev),
			formatTime(stats.p95),
			formatTime(stats.p99),
		]],
	);
}

export function createHeapTable(result) {
	const cycles = result.measurements?.cycles ?? [];

	const rows = cycles.map((entry) => [
		String(entry.cycle),
		formatBytes(entry.before),
		formatBytes(entry.afterMount),
		formatBytes(entry.afterUpdate),
		formatBytes(entry.afterDestroy),
		formatBytes(entry.metrics?.mountIncrease ?? 0),
		formatBytes(entry.metrics?.updateIncrease ?? 0),
		formatBytes(entry.metrics?.retained ?? 0),
	]);

	return createMarkdownTable(
		[
			"Cycle",
			"Before",
			"After Mount",
			"After Update",
			"After Destroy",
			"Mount Δ",
			"Update Δ",
			"Retained",
		],
		rows,
	);
}

export function createDslTable(stageResults) {
	const rows = stageResults.map(({ name, result }) => {
		const stats = result.statistics ?? result.measurements?.statistics ?? {};
		const warmup = result.environment?.warmupIterations ?? result.warmupCount ?? "";
		const operationCount = result.batchSize ?? 1;
		const operationLabel = operationCount === 1 ? "operation" : "operations";
		return [
			name,
			`${operationCount.toLocaleString("en-US")} ${operationLabel} per sample`,
			warmup === "" ? "" : `${warmup} iterations`,
			formatDuration(stats.mean),
			formatDuration(stats.median),
			formatDuration(stats.min),
			formatDuration(stats.max),
			formatDuration(stats.stdDev),
			formatDuration(stats.p95),
			formatDuration(stats.p99),
		];
	});

	return createMarkdownTable(
		[
			"Stage",
			"Operations",
			"Warmup",
			"Mean",
			"Median",
			"Min",
			"Max",
			"Std Dev",
			"P95",
			"P99",
		],
		rows,
	);
}
