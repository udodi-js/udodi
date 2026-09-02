import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const resultsDirectory = path.resolve("results");

export async function writeReport({ framework, benchmark, environment, result }) {
    const benchmarkDirectory = path.join(resultsDirectory, benchmark.name);
    await mkdir(benchmarkDirectory, { recursive: true });

    const report = {
        framework,
        benchmark,
        environment,
        ...result,
    };

    const outputPath = path.join(benchmarkDirectory, `${framework.name.toLowerCase()}.json`);
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

    return outputPath;
}
