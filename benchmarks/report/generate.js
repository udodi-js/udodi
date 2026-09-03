import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	createHeapTable,
	createDslTable,
	createTimingTable,
} from "./tables.js";
import {
	chartLabel,
	renderBarChartSvg,
	renderLineChartSvg,
	writeChartFile,
} from "./charts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const benchmarkRoot = path.resolve(__dirname, "..");
const resultsRoot = path.resolve(benchmarkRoot, "results");
const templatePath = path.resolve(benchmarkRoot, "templates", "performance.md");
const docsRoot = path.resolve(benchmarkRoot, "..", "docs");
const assetsRoot = path.resolve(docsRoot, "performance-assets");

async function readJson(filePath) {
	const source = await fs.readFile(filePath, "utf8");
	return JSON.parse(source);
}

function readResult(relative) {
	return readJson(path.resolve(resultsRoot, relative));
}

function formatBytesLabel(value) {
	const numericValue = Number(value || 0);
	const absValue = Math.abs(numericValue);
	if (absValue < 1024) return `${numericValue.toFixed(0)} B`;
	if (absValue < 1024 * 1024) return `${(numericValue / 1024).toFixed(2)} KB`;
	return `${(numericValue / (1024 * 1024)).toFixed(2)} MB`;
}

function createEnvironmentSummary(result) {
	const environment = result.environment ?? {};
	const rows = [
		["Browser", `${environment.browser ?? "Unknown"} ${environment.browserVersion ?? ""}`.trim()],
		["Operating system name", environment.osName ?? environment.os ?? "Unknown"],
		["Operating system version", environment.osVersion ?? "Unknown"],
		["CPU", `${environment.cpu ?? "Unknown"} (${environment.logicalCpuCount ?? "?"} logical cores)`],
		["Memory", environment.ramGiB ? `${environment.ramGiB} GiB` : "Unknown"],
		["Architecture", environment.architecture ?? "Unknown"],
		["Node.js", environment.nodeVersion ?? "Unknown"],
	];

	return [
		"| Property | Value |",
		"| --- | --- |",
		...rows.map(([name, value]) => `| ${name} | ${value} |`),
	].join("\n");
}

function createCssWorkloadSummary(result) {
	const workload = result.workload ?? {};
	const rows = [
		["Scoped components", workload.componentCount],
		["Selectors per component", workload.selectorsPerComponent],
		["Total scoped selectors", workload.totalSelectors],
		["Declarations per selector", workload.declarationsPerSelector],
		["Total CSS declarations", workload.totalDeclarations],
	].filter(([, value]) => value !== undefined);

	if (rows.length === 0) return "_Workload metadata unavailable in this result._";

	return [
		"| Workload | Value |",
		"| --- | ---: |",
		...rows.map(([name, value]) => `| ${name} | ${Number(value).toLocaleString("en-US")} |`),
	].join("\n");
}

async function createTimingSummaryChart(result, fileName, chartName, unit = "ms") {
	const stats = result.statistics ?? result.measurements?.statistics ?? {};
	const labels = ["Mean", "Median", "P95", "P99"];
	const values = [stats.mean, stats.median, stats.p95, stats.p99];
	const chart = renderBarChartSvg({
		labels,
		values,
		xLabel: "Metric",
		yLabel: `Time (${unit})`,
		valueFormatter: (value) => `${Number(value || 0).toFixed(2)} ${unit}`,
	});
	await writeChartFile(path.resolve(assetsRoot, fileName), chart);
	return chartLabel(chartName, `./performance-assets/${fileName}`);
}

async function createHeapChart(result, fileName, chartName) {
	const cycles = result.measurements?.cycles ?? [];
	const labels = cycles.map((entry) => `Cycle ${entry.cycle}`);
	const datasets = [
		{ label: "before", data: cycles.map((entry) => entry.before), color: "#94a3b8" },
		{ label: "afterMount", data: cycles.map((entry) => entry.afterMount), color: "#3b82f6" },
		{ label: "afterUpdate", data: cycles.map((entry) => entry.afterUpdate), color: "#f59e0b" },
		{ label: "afterDestroy", data: cycles.map((entry) => entry.afterDestroy), color: "#10b981" },
	];
	const chart = renderLineChartSvg({
		labels,
		datasets,
		xLabel: "Cycle",
		yLabel: "Heap (bytes)",
		valueFormatter: formatBytesLabel,
		 includeZero: true,
	});
	await writeChartFile(path.resolve(assetsRoot, fileName), chart);
	return chartLabel(chartName, `./performance-assets/${fileName}`);
}

async function createDslChart(dslResults, fileName, chartName) {
	const labels = dslResults.map((entry) => entry.name);
	const values = dslResults.map((entry) => entry.result.statistics?.mean ?? 0);
	const chart = renderBarChartSvg({
		labels,
		values,
		xLabel: "Stage",
		yLabel: "Time (ms)",
		valueFormatter: (value) => `${Number(value || 0).toFixed(2)} ms`,
	});
	await writeChartFile(path.resolve(assetsRoot, fileName), chart);
	return chartLabel(chartName, `./performance-assets/${fileName}`);
}

async function createCssScopeChart(coldResult, warmResult, fileName, chartName) {
	const labels = ["Cold", "Warm"];
	const values = [
		coldResult.statistics?.mean ?? 0,
		warmResult.statistics?.mean ?? 0,
	];
	const chart = renderBarChartSvg({
		labels,
		values,
		color: "#8b5cf6",
		xLabel: "Mode",
		yLabel: "Time (ms)",
		valueFormatter: (value) => `${Number(value || 0).toFixed(2)} ms`,
	});
	await writeChartFile(path.resolve(assetsRoot, fileName), chart);
	return chartLabel(chartName, `./performance-assets/${fileName}`);
}

async function generateReport() {
	const template = await fs.readFile(templatePath, "utf8");
	await fs.mkdir(assetsRoot, { recursive: true });

	const mountResult = await readResult("mount/udodi.json");
	const updateSingleResult = await readResult("update-single/udodi.json");
	const updateBatchedResult = await readResult("update-batched/udodi.json");
	const heapResult = await readResult("heap/udodi.json");
	const cssScopeColdResult = await readResult("css-scope-cold/udodi.json");
	const cssScopeWarmResult = await readResult("css-scope-warm/udodi.json");
	const dslResults = await Promise.all([
		{ name: "Parse", path: "dsl-parse/udodi.json" },
		{ name: "Compile (cold)", path: "dsl-compile-cold/udodi.json" },
		{ name: "Compile (cached)", path: "dsl-compile-cached/udodi.json" },
		{ name: "Evaluate", path: "dsl-evaluate/udodi.json" },
		{ name: "Directive", path: "dsl-directive/udodi.json" },
	].map(async (entry) => ({ name: entry.name, result: await readResult(entry.path) })));

	const replacements = {
		"{{mount.table}}": createTimingTable(mountResult, "1 mount of 1,000 rows"),
		"{{mount.chart}}": await createTimingSummaryChart(mountResult, "mount.svg", "Mount benchmark"),
		"{{update-single.table}}": createTimingTable(updateSingleResult, "1 update per sample"),
		"{{update-single.chart}}": await createTimingSummaryChart(updateSingleResult, "update-single.svg", "Single update benchmark"),
		"{{update-batched.table}}": createTimingTable(updateBatchedResult, "100 updates per sample"),
		"{{update-batched.chart}}": await createTimingSummaryChart(updateBatchedResult, "update-batched.svg", "Batched update benchmark"),
		"{{heap.table}}": createHeapTable(heapResult),
		"{{heap.chart}}": await createHeapChart(heapResult, "heap.svg", "Heap lifecycle benchmark"),
		"{{dsl.table}}": createDslTable(dslResults),
		"{{dsl.chart}}": await createDslChart(dslResults, "dsl.svg", "DSL benchmark stages"),
		"{{css-scope-cold.table}}": createTimingTable(cssScopeColdResult, "1 scoped mount per sample"),
		"{{css-scope-warm.table}}": createTimingTable(cssScopeWarmResult, "1 scoped mount per sample"),
		"{{css-scope.chart}}": await createCssScopeChart(cssScopeColdResult, cssScopeWarmResult, "css-scope.svg", "CSS scope benchmark"),
		"{{udodi.version}}": (mountResult.framework?.version ?? "unknown"),
		"{{generated.at}}": new Date().toISOString().replace("T", " ").replace("Z", " UTC"),
		"{{environment.summary}}": createEnvironmentSummary(mountResult),
		"{{css-scope.workload}}": createCssWorkloadSummary(cssScopeColdResult),
	};

	let report = template;
	for (const [placeholder, value] of Object.entries(replacements)) {
		report = report.replaceAll(placeholder, String(value));
	}

	const unresolved = report.match(/\{\{[^}]+\}\}/g);
	if (unresolved) {
		throw new Error(`Unresolved placeholders remain: ${unresolved.join(", ")}`);
	}

	const outputPath = path.resolve(docsRoot, "performance.md");
	await fs.writeFile(outputPath, report, "utf8");
	console.log(`Generated performance report at ${outputPath}`);
}

generateReport().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
