#!/usr/bin/env node
/**
 * Udodi post-build script
 *
 * Runs after tsup finishes. Responsibilities:
 * 1. Copy essential files into dist/
 * 2. Verify package.json fields that consumers rely on
 * 3. Optionally validate that every export in packages/index.js
 *    has a corresponding declaration in the generated .d.ts
 *
 * Usage: node scripts/postbuild.js
 * Hooked via: "build": "tsup && node scripts/postbuild.js"
 */

import { copyFile, mkdir, readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");

// ────────────────────────────────────────────────
// Files that must end up in dist/
// ────────────────────────────────────────────────
const FILES_TO_COPY = [
	// Declaration file lives inside packages/
	{ src: "packages/index.d.ts", dest: "index.d.ts" },

	// Documentation & license (root level)
	{ src: "README.md", dest: "README.md" },
	{ src: "LICENSE", dest: "LICENSE" },
];

const REQUIRED_PACKAGE_FIELDS = [
	"name",
	"version",
	"main",
	"module",
	"types",
	"exports",
	"files",
	"sideEffects", // recommended for libraries
];

async function exists(path) {
	try {
		await access(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

async function ensureDir(dir) {
	await mkdir(dir, { recursive: true });
}

async function copyFiles() {
	console.log("📦 Copying distribution files…");

	for (const { src, dest } of FILES_TO_COPY) {
		const from = join(ROOT, src);
		const to = join(DIST, dest);

		if (!(await exists(from))) {
			console.warn(`  ⚠️  Skipping missing file: ${src}`);
			continue;
		}

		await ensureDir(dirname(to));
		await copyFile(from, to);
		console.log(`  ✓ ${src} → dist/${dest}`);
	}
}

async function verifyPackageJson() {
	console.log("🔍 Verifying package.json fields…");

	const pkgPath = join(ROOT, "package.json");
	const pkg = JSON.parse(await readFile(pkgPath, "utf8"));

	const missing = REQUIRED_PACKAGE_FIELDS.filter((f) => !(f in pkg));
	if (missing.length) {
		// soft warning for sideEffects (many projects omit it)
		const critical = missing.filter((f) => f !== "sideEffects");
		if (critical.length) {
			throw new Error(
				`package.json is missing required fields: ${critical.join(", ")}`,
			);
		}
		console.warn(`  ⚠️  Recommended field missing: ${missing.join(", ")}`);
	}

	// Sanity-check exports
	if (pkg.exports) {
		const entry = pkg.exports["."] || pkg.exports;
		if (!entry?.types && !entry?.import) {
			console.warn('  ⚠️  package.json "exports" looks incomplete');
		}
	}

	// Ensure "files" includes what we publish
	const files = pkg.files || [];
	const expected = ["dist", "README.md", "LICENSE"];
	for (const item of expected) {
		if (!files.includes(item) && !files.some((f) => f.startsWith(item))) {
			console.warn(`  ⚠️  package.json "files" does not list "${item}"`);
		}
	}

	console.log("  ✓ package.json looks good");
}

/**
 * Lightweight heuristic: extract named exports from packages/index.js
 * and check they appear in dist/index.d.ts (the file we just copied or
 * the one tsup generated).
 */
async function validateExportsHaveDeclarations() {
	const indexJs = join(ROOT, "packages", "index.js");
	// Prefer the declaration we just copied into dist/
	const dts = join(DIST, "index.d.ts");

	if (!(await exists(indexJs)) || !(await exists(dts))) {
		console.log("  ℹ️  Skipping export and declaration check (files missing)");
		return;
	}

	console.log("🔎 Validating exports have declarations…");

	const jsSource = await readFile(indexJs, "utf8");
	const dtsSource = await readFile(dts, "utf8");

	const namedExports = new Set();

	// export { foo, bar as baz }
	for (const match of jsSource.matchAll(/export\s*\{([^}]+)\}/g)) {
		const names = match[1]
			.split(",")
			.map((s) =>
				s.trim().split(/\s+as\s+/).pop().trim(),
			)
			.filter(Boolean);
		names.forEach((n) => namedExports.add(n));
	}

	// export function / const / class / let / var
	for (const match of jsSource.matchAll(
		/export\s+(?:async\s+)?(?:function|const|class|let|var)\s+([A-Za-z_$][\w$]*)/g,
	)) {
		namedExports.add(match[1]);
	}

	const hasDefault = /export\s+default\b/.test(jsSource);

	const missing = [];
	for (const name of namedExports) {
		const pattern = new RegExp(
			`(?:export\\s+(?:declare\\s+)?(?:function|const|class|type|interface|enum)\\s+${name}\\b)|(?:export\\s*\\{[^}]*\\b${name}\\b)|(?:declare\\s+(?:function|const|class|type|interface|enum)\\s+${name}\\b)`,
		);
		if (!pattern.test(dtsSource)) {
			missing.push(name);
		}
	}

	if (hasDefault && !/export\s+default\b|declare\s+.*default/.test(dtsSource)) {
		missing.push("default");
	}

	if (missing.length) {
		throw new Error(`Missing declarations: ${missing.join(", ")}`);
	} else {
		console.log(`  ✓ ${namedExports.size} exports appear to have declarations`);
	}
}

async function main() {
	console.log("\n Udodi post-build\n");

	if (!(await exists(DIST))) {
		throw new Error("dist/ folder does not exist. Did tsup run successfully?");
	}

	await copyFiles();
	await verifyPackageJson();
	await validateExportsHaveDeclarations();

	console.log("\n✅ Post-build completed successfully\n");
}

main().catch((err) => {
	console.error("\n❌ Post-build failed:\n", err.message || err);
	process.exit(1);
});
