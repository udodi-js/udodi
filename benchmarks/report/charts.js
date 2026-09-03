import fs from "node:fs/promises";
import path from "node:path";

export function chartLabel(name, fileName) {
	return `![${name}](${fileName})`;
}

function formatAxisValue(value, formatter) {
	return formatter(toNumber(value));
}

function toNumber(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number : 0;
}

function escapeXml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function getScale(values, includeZero = false, yMin, yMax) {
	const numericValues = values.map(toNumber);

	if (numericValues.length === 0) {
		return { min: 0, max: 1, range: 1 };
	}

	let min = Math.min(...numericValues);
	let max = Math.max(...numericValues);

	if (includeZero) {
		min = Math.min(min, 0);
		max = Math.max(max, 0);
	}
	if (Number.isFinite(yMin)) min = yMin;
	if (Number.isFinite(yMax)) max = yMax;
	if (includeZero) {
		min = Math.min(min, 0);
		max = Math.max(max, 0);
	}

	if (min === max) {
		const padding = Math.max(Math.abs(min) * 0.1, 1);
		min -= padding;
		max += padding;
	} else if (!includeZero && !Number.isFinite(yMin) && !Number.isFinite(yMax)) {
		const padding = (max - min) * 0.05;
		min -= padding;
		max += padding;
	}

	return { min, max, range: max - min };
}

function renderYAxis({ min, max, range, plotLeft, plotRight, plotTop, plotHeight, valueFormatter, ticks = 5 }) {
	const grid = [];
	const labels = [];

	for (let index = 0; index < ticks; index++) {
		const ratio = index / (ticks - 1);
		const value = max - range * ratio;
		const y = plotTop + plotHeight * ratio;
		const stroke = Math.abs(value) < range / 1000 ? "#94a3b8" : "#e5e7eb";
		grid.push(`<line x1="${plotLeft}" x2="${plotRight}" y1="${y}" y2="${y}" stroke="${stroke}" stroke-width="1" />`);
		labels.push(`<text x="54" y="${y + 4}" font-size="10" text-anchor="end" fill="#475569">${escapeXml(formatAxisValue(value, valueFormatter))}</text>`);
	}

	return { grid: grid.join("\n"), labels: labels.join("\n") };
}

export function renderLineChartSvg({
	labels,
	datasets,
	width = 800,
	height = 360,
	xLabel = "Cycle",
	yLabel = "Value",
	valueFormatter = (value) => `${value}`,
	includeZero = false,
	yMin,
	yMax,
}) {
	const allValues = datasets.flatMap((dataset) => dataset.data);
	const { min, max, range } = getScale(allValues, includeZero, yMin, yMax);
	const plotLeft = 60;
	const plotRight = width - 20;
	const plotTop = 55;
	const plotBottom = height - 70;
	const plotHeight = plotBottom - plotTop;
	const xStep = labels.length > 1 ? (plotRight - plotLeft) / (labels.length - 1) : 0;
	const colors = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2"];

	const seriesMarkup = datasets
		.map((dataset, datasetIndex) => {
			const color = dataset.color ?? colors[datasetIndex % colors.length];
			const points = dataset.data.map((value, index) => {
				const numericValue = toNumber(value);
				const x = labels.length === 1 ? (plotLeft + plotRight) / 2 : plotLeft + index * xStep;
				const y = plotBottom - ((numericValue - min) / range) * plotHeight;
				return `${x},${y}`;
			}).join(" ");
			const pointsMarkup = dataset.data.map((value, index) => {
				const numericValue = toNumber(value);
				const x = labels.length === 1 ? (plotLeft + plotRight) / 2 : plotLeft + index * xStep;
				const y = plotBottom - ((numericValue - min) / range) * plotHeight;
				return `<circle cx="${x}" cy="${y}" r="3" fill="${color}" />`;
			}).join("\n");

			return `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${points}" />${pointsMarkup}`;
		})
		.join("\n");

	const yAxis = renderYAxis({ min, max, range, plotLeft, plotRight, plotTop, plotHeight, valueFormatter });

	const xLabels = labels
		.map((label, index) => {
			const x = labels.length === 1 ? (plotLeft + plotRight) / 2 : plotLeft + index * xStep;
			return `<text x="${x}" y="${plotBottom + 20}" font-size="10" text-anchor="middle" fill="#475569">${escapeXml(label)}</text>`;
		})
		.join("\n");

	const zeroLine = includeZero && min <= 0 && max >= 0
		? `<line x1="${plotLeft}" x2="${plotRight}" y1="${plotBottom - ((0 - min) / range) * plotHeight}" y2="${plotBottom - ((0 - min) / range) * plotHeight}" stroke="#64748b" stroke-width="1.5" />`
		: "";
	const legend = datasets.map((dataset, index) => {
		const column = index % 4;
		const row = Math.floor(index / 4);
		const x = plotLeft + column * 180;
		const y = 16 + row * 18;
		const color = dataset.color ?? colors[index % colors.length];
		return `<rect x="${x}" y="${y - 9}" width="10" height="10" fill="${color}" /><text x="${x + 16}" y="${y}" font-size="11" fill="#334155">${escapeXml(dataset.label ?? `Series ${index + 1}`)}</text>`;
	}).join("\n");

	return `
		<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
			<rect width="100%" height="100%" fill="#ffffff" />
			${legend}
			${yAxis.grid}
			${zeroLine}
			${seriesMarkup}
			${xLabels}
			${yAxis.labels}
			<text x="${width / 2}" y="${height - 7}" font-size="12" fill="#334155" text-anchor="middle">${escapeXml(xLabel)}</text>
			<text x="10" y="${(plotTop + plotBottom) / 2}" font-size="12" fill="#334155" text-anchor="middle" transform="rotate(-90 10 ${(plotTop + plotBottom) / 2})">${escapeXml(yLabel)}</text>
		</svg>
	`;
}

export function renderBarChartSvg({
	labels,
	values,
	width = 800,
	height = 360,
	color = "#3b82f6",
	xLabel = "Metric",
	yLabel = "Time",
	valueFormatter = (value) => `${value}`,
	showValueLabels = true,
	yMin,
	yMax,
}) {
	const numericValues = values.map(toNumber);
	const { min, max, range } = getScale(numericValues, true, yMin, yMax);
	const plotLeft = 60;
	const plotRight = width - 20;
	const plotTop = 55;
	const plotBottom = height - 70;
	const plotHeight = plotBottom - plotTop;
	const plotWidth = plotRight - plotLeft;
	const step = plotWidth / Math.max(labels.length, 1);
	const barWidth = Math.max(12, Math.min(90, step * 0.7));
	const zeroY = plotBottom - ((0 - min) / range) * plotHeight;

	const bars = values
		.map((value, index) => {
			const numericValue = toNumber(value);
			const x = plotLeft + index * step + (step - barWidth) / 2;
			const valueY = plotBottom - ((numericValue - min) / range) * plotHeight;
			const y = Math.min(zeroY, valueY);
			const barHeight = Math.max(Math.abs(valueY - zeroY), 1);
			const labelY = numericValue >= 0 ? y - 8 : y + barHeight + 14;
			const labelText = showValueLabels ? `<text x="${x + barWidth / 2}" y="${labelY}" font-size="10" text-anchor="middle" fill="#0f172a">${escapeXml(formatAxisValue(value, valueFormatter))}</text>` : "";
			return `
				<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="${color}" />
				${labelText}
				<text x="${x + barWidth / 2}" y="${plotBottom + 20}" font-size="10" text-anchor="middle" fill="#475569">${escapeXml(labels[index])}</text>
			`;
		})
		.join("\n");

	const yAxis = renderYAxis({ min, max, range, plotLeft, plotRight, plotTop, plotHeight, valueFormatter });

	return `
		<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
			<rect width="100%" height="100%" fill="#ffffff" />
			${yAxis.grid}
			<line x1="${plotLeft}" x2="${plotRight}" y1="${zeroY}" y2="${zeroY}" stroke="#64748b" stroke-width="1.5" />
			${bars}
			${yAxis.labels}
			<text x="${width / 2}" y="${height - 7}" font-size="12" fill="#334155" text-anchor="middle">${escapeXml(xLabel)}</text>
			<text x="10" y="${(plotTop + plotBottom) / 2}" font-size="12" fill="#334155" text-anchor="middle" transform="rotate(-90 10 ${(plotTop + plotBottom) / 2})">${escapeXml(yLabel)}</text>
		</svg>
	`;
}

export async function writeChartFile(outputPath, svgMarkup) {
	const directory = path.dirname(outputPath);
	await fs.mkdir(directory, { recursive: true });
	await fs.writeFile(outputPath, svgMarkup, "utf8");
}
