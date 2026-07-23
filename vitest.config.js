import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	test: {
		globals: true,
		environment: "happy-dom",

		// Automatically polyfill IndexedDB globally for happy-dom
		setupFiles: ["fake-indexeddb/auto"],

		// Include all test files inside tests/ and subfolders
		include: ["tests/**/*.{test,spec}.{js,mjs,ts,tsx}"],

		exclude: ["node_modules", "dist", "playground"],

		alias: {
			udodi: path.resolve(__dirname, "./packages"),
		},
	},
});
