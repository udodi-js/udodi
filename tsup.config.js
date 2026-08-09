import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: [
			"packages/index.js"
		],

		// Output both modern module + browser global
		format: ["esm", "iife"],

		// Global name for IIFE build (window.Udodi)
		globalName: "Udodi",

		outDir: "dist",

		clean: true,

		minify: true,

		sourcemap: true,

		target: "es2020",

		// Good default for libraries (prevents overly complex chunk splitting)
		splitting: false,

		// Keep bundle predictable for CDN usage
		treeshake: true,

		// Optional: disable TS features entirely (safe for JS projects)
		dts: false,

        // Do not bundle worker files into the main library
		external: [/\.worker\.js$/],
	},
	{
		entry: [
			"packages/query/main.worker.js",
			"packages/query/compute.worker.js",
		],
		format: ["esm"],
		outDir: "dist",
		minify: true,
		sourcemap: true,
		target: "es2020",
		splitting: false,
	},
]);
