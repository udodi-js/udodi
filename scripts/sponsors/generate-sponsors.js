/**
 * @fileoverview Automated Sponsor Wall Generator for Udodi.
 *
 * This script processes a localized sponsor manifest (`sponsors.json`) and
 * dynamically compiles a highly optimized, responsive SVG sponsor wall saved to
 * the project's documentation folder for consumption directly inside the main `README.md`.
 *
 * ### Architectural Features:
 * - **Deterministic Multi-Tier Grid Alignment:** Computes pixel-perfect coordinate templates
 *   to ensure both Platinum (3 columns) and Gold (4 columns) tiers align precisely to a
 *   flush bounding maximum container width of 812px with uniform 12px gaps.
 * - **16:9 Cinematic Proportions:** Formats individual sponsor layout cards to a fixed
 *   16:9 widescreen aspect ratio matching high-end open-source landing standards.
 * - **Dynamic Canvas Calculations:** Automatically scales the absolute height boundaries
 *   and viewBox coordinates of the parent SVG container relative to active backer row limits.
 * - **Zero-Height Layout Invalidation:** Implements an invisible 1x1 transparent canvas
 *   placeholder fallback when zero public sponsors are validated, seamlessly collapsing the
 *   layout profile inside the README wrapper without outputting broken graphics cards.
 * - **Static Resource Inlining Engine:** Downloads image assets at build time. Vector (.svg)
 *   files are dynamically inlined within embedded sandbox containers, and raster files are
 *   transcoded into standard self-contained Base64 Data URIs. Relative / local paths (e.g.
 *   `/sponsors/logos/toncoin.png`) are loaded from the local docs/public directory.
 * - **ID and Style Prefixing Isolation:** Automatically scopes element IDs, URL clip/fill
 *   references, and CSS style rules uniquely per sponsor to prevent multi-logo vector collision bugs.
 * - **Sanitized Presentation Security:** Completely strips all interactive anchor link tags
 *   (`<a>`) to guarantee direct visual rendering under restrictive Content Security Policies (CSP).
 *
 * ### Execution Rules:
 * Run this module as a pre-commit or automated CI/CD pipeline step using Node.js:
 * ```bash
 * node scripts/generate-sponsors.js
 * ```
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	loadSponsors,
	createTierSection,
	TIER_TITLES,
} from "./sponsor-common.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_FILE = path.resolve(__dirname, "../../docs/public/sponsors/sponsors.svg");

/**
 * Visual configuration for each sponsorship tier (full-size wall).
 *
 * Platinum sponsors receive larger cards and more visual space,
 * while Gold sponsors use a denser grid.
 *
 * @type {Object<string, {
 *   title: string,
 *   columns: number,
 *   cardWidth: number,
 *   cardHeight: number,
 *   gap: number,
 *   padding: number
 * }>}
 */
const TIER_CONFIG = {
	platinum: {
		title: TIER_TITLES.platinum,
		columns: 3,
		cardWidth: 262.66,
		cardHeight: 147.75,
		gap: 12,
		padding: 10,
	},

	gold: {
		title: TIER_TITLES.gold,
		columns: 4,
		cardWidth: 194,
		cardHeight: 109.12,
		gap: 12,
		padding: 8,
	},
};

/**
 * Layout constants shared by all sponsorship tiers (full-size).
 *
 * @type {{padding: number, sectionGap: number}}
 */
const LAYOUT = {
	padding: 24,
	sectionGap: 36,
};

/**
 * Generates the complete combined sponsor SVG (full-size).
 *
 * @param {{platinum: Object[], gold: Object[]}} sponsors
 * @returns {string}
 */
function createSponsorSvg(sponsors) {
	if (sponsors.platinum.length === 0 && sponsors.gold.length === 0) {
		return `
			<svg xmlns="http://www.w3.org/2000/svg" width="1" height="0" viewBox="0 0 1 0" opacity="0">
		    	<title>Udodi Sponsors</title>
			</svg>
		`;
	}

	const canvasWidth = 900;

	const platinumSection = createTierSection(
		TIER_CONFIG.platinum.title,
		sponsors.platinum,
		LAYOUT.padding,
		canvasWidth,
		TIER_CONFIG.platinum,
	);

	const goldY = LAYOUT.padding + platinumSection.height + LAYOUT.sectionGap;

	const goldSection = createTierSection(
		TIER_CONFIG.gold.title,
		sponsors.gold,
		goldY,
		canvasWidth,
		TIER_CONFIG.gold,
	);
	
	const canvasHeight = goldY + goldSection.height + LAYOUT.padding;

	return `
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="100%"
			height="100%"
			viewBox="0 0 ${canvasWidth} ${canvasHeight}"
			role="img"
			aria-label="Udodi sponsors"
		>
			<title>Udodi sponsors</title>

			${platinumSection.svg}

			${goldSection.svg}
		</svg>
	`;
}

/**
 * Writes the generated sponsor SVG.
 *
 * @param {string} svg
 * @returns {Promise<void>}
 */
async function writeSponsorSvg(svg) {
	await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
	await fs.writeFile(OUTPUT_FILE, svg, "utf8");

	console.log(`Generated sponsor wall: ${OUTPUT_FILE}`);
}

/**
 * Generates the combined Udodi sponsor wall (full-size for README / site).
 *
 * @returns {Promise<void>}
 */
async function generateSponsors() {
	const sponsors = await loadSponsors({ tiers: ["platinum", "gold"] });
	const svg = createSponsorSvg(sponsors);

	await writeSponsorSvg(svg);

	console.log(`Platinum sponsors: ${sponsors.platinum.length}`);
	console.log(`Gold sponsors: ${sponsors.gold.length}`);
}

generateSponsors().catch((error) => {
	console.error("[generate-sponsors] Failed:", error);
	process.exitCode = 1;
});
