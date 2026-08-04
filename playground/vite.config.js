import { defineConfig } from "vite";
import path from "path";

const repoRoot = path.resolve(__dirname, "../");

export default defineConfig({
	server: {
		port: 5173,
		open: true,
		fs: {
			// Allow repo root so dist/ + packages/ can be served to workers
			allow: [repoRoot],
		},
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
	},
	resolve: {
		alias: {
			udodi: repoRoot
		},
	},
	worker: {
		format: "es",
	},
});
