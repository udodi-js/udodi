import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const scriptDir = import.meta.dirname;
const root = resolve(import.meta.dirname, "..");

const sourcePath = resolve(root, "ROADMAP.md");
const templatePath = resolve(scriptDir, "templates/roadmap.md");
const targetPath = resolve(root, "docs/roadmap.md");

const placeholder = "{{content}}";

const source = await readFile(sourcePath, "utf8");
const template = await readFile(templatePath, "utf8");

if (!template.includes(placeholder)) {
	throw new Error(
		`Placeholder "${placeholder}" was not found in ${templatePath}`
	);
}

const output = template.replace(placeholder, source.trimEnd());

await writeFile(targetPath, output, "utf8");

console.log(`Roadmap copied: ${sourcePath} -> ${targetPath}`);
