/**
 * @fileoverview Automated Backers SVG Generator for Udodi.
 *
 * Produces a compact, self-contained SVG sponsor wall written to
 * `docs/public/sponsors/backers.svg`.
 *
 * The generated wall includes every public sponsor from Platinum through
 * Supporter. Platinum and Gold sponsors are rendered as logo cards, while
 * Silver, Bronze, Builder, and Supporter sponsors are rendered as name grids.
 *
 * Shares sponsor loading, validation, logo processing, and card-rendering
 * logic with `generate-sponsors.js` via `sponsor-common.js`.
 *
 * ### Differences from the full-size wall
 * - Canvas width reduced from 900px to 700px.
 * - Card dimensions, gaps, and paddings are scaled down.
 * - Section and outer padding are tightened.
 * - Lower sponsorship tiers are rendered as compact three-column name grids.
 * - No external image URLs are emitted; sponsor logos are already processed
 *   by `sponsor-common.js` into inline SVG content or Base64 data URLs.
 *
 * ### Execution Rules:
 * ```bash
 * node scripts/generate-backers.js
 * ```
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	loadSponsors,
	createTierSection,
	createEmptyTier,
	TIER_TITLES,
	ALL_TIERS,
	escapeXml,
} from "./sponsor-common.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKERS_SVG_FILE = path.resolve(
	__dirname,
	"../../docs/public/sponsors/backers.svg",
);

/**
 * Visual configuration for the compact logo-card tiers.
 *
 * Every tier occupies the same 650px grid width. As the sponsorship
 * tier decreases, the number of columns increases while each card
 * becomes smaller. Every card maintains a strict 16:9 aspect ratio.
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
		cardWidth: 210,
		cardHeight: 118.125,
		gap: 10,
		padding: 8,
	},

	gold: {
		title: TIER_TITLES.gold,
		columns: 4,
		cardWidth: 155,
		cardHeight: 87.1875,
		gap: 10,
		padding: 6,
	},

	silver: {
		title: TIER_TITLES.silver,
		columns: 5,
		cardWidth: 122,
		cardHeight: 68.625,
		gap: 10,
		padding: 5,
	},

	bronze: {
		title: TIER_TITLES.bronze,
		columns: 6,
		cardWidth: 100,
		cardHeight: 56.25,
		gap: 10,
		padding: 4,
	},
};

/**
 * Layout constants for the compact sponsor wall.
 *
 * @type {{padding: number, sectionGap: number}}
 */
const LAYOUT = {
	padding: 16,
	sectionGap: 24,
};

/**
 * Configuration for name-only sponsorship tiers.
 *
 * Builder and Supporter sponsors are displayed in three left-aligned
 * columns without visual logo cards.
 *
 * @type {{
 *   columns: number,
 *   rowHeight: number,
 *   columnGap: number,
 *   rowGap: number,
 *   sectionTitleHeight: number,
 *   titleToGridGap: number
 * }}
 */
const NAME_GRID_CONFIG = {
	columns: 3,
	rowHeight: 24,
	columnGap: 18,
	rowGap: 4,
	sectionTitleHeight: 20,
	titleToGridGap: 10,
};

/**
 * Creates a compact three-column name grid for a lower sponsorship tier.
 *
 * Names are rendered without external links because the generated SVG must
 * remain self-contained and GitHub README / npm SVG rendering does not
 * reliably support interactive anchor wrappers.
 *
 * @param {string} tier
 * @param {Object[]} sponsors
 * @param {number} y
 * @param {number} canvasWidth
 * @returns {{svg: string, height: number}}
 */
function createNameTierSection(tier, sponsors, y, canvasWidth) {
	const {
		columns,
		rowHeight,
		columnGap,
		rowGap,
		sectionTitleHeight,
		titleToGridGap,
	} = NAME_GRID_CONFIG;

	const title = TIER_TITLES[tier] || tier;

	const horizontalPadding = 24;
	const contentWidth = canvasWidth - horizontalPadding * 2;
	const columnWidth =
		(contentWidth - columnGap * (columns - 1)) / columns;

	const rows = Math.max(1, Math.ceil(sponsors.length / columns));

	const gridHeight =
		rows * rowHeight + Math.max(0, rows - 1) * rowGap;

	const sectionHeight =
		sectionTitleHeight +
		titleToGridGap +
		gridHeight;

	const titleY = y + 14;
	const gridY = y + sectionTitleHeight + titleToGridGap;

	let content = `
		<text
			x="${horizontalPadding}"
			y="${titleY}"
			text-anchor="start"
			font-family="-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Helvetica, Arial, sans-serif"
			font-size="14"
			font-weight="600"
			letter-spacing="1"
			fill="#57606a"
		>
			${escapeXml(title)}
		</text>
	`;

	if (sponsors.length === 0) {
		content += createEmptyTier(
			canvasWidth,
			y + sectionTitleHeight + titleToGridGap + 12,
		);

		return {
			svg: content,
			height: sectionTitleHeight + titleToGridGap + 34,
		};
	}

	for (let i = 0; i < sponsors.length; i++) {
		const column = i % columns;
		const row = Math.floor(i / columns);

		const x =
			horizontalPadding +
			column * (columnWidth + columnGap);

		const itemY =
			gridY +
			row * (rowHeight + rowGap);

		content += `
			<text
				x="${x}"
				y="${itemY + 16}"
				text-anchor="start"
				font-family="-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Helvetica, Arial, sans-serif"
				font-size="13"
				fill="#24292f"
			>
				${escapeXml(sponsors[i].name)}
			</text>
		`;
	}

	return {
		svg: content,
		height: sectionHeight,
	};
}

/**
 * Creates the compact combined sponsor SVG.
 *
 * The generated wall includes every public sponsor from Platinum through
 * Supporter. Platinum, Gold, Silver, and Bronze sponsors are rendered as
 * progressively denser logo-card grids, while Builder and Supporter sponsors
 * are rendered as left-aligned three-column name grids.
 *
 * When no public sponsors exist at all, a zero-height transparent SVG is
 * returned so the layout collapses cleanly inside README / markdown wrappers.
 *
 * @param {Object<string, Object[]>} sponsors
 * @returns {string}
 */
function createBackersSvg(sponsors) {
	// Zero-height transparent fallback when every tier is empty
	if (ALL_TIERS.every((tier) => (sponsors[tier] ?? []).length === 0)) {
		return `
			<svg xmlns="http://www.w3.org/2000/svg" width="1" height="0" viewBox="0 0 1 0" opacity="0">
				<title>Udodi Sponsors</title>
			</svg>
		`;
	}

	const canvasWidth = 700;

	const sections = [];

	/**
	 * @type {number}
	 */
	let currentY = LAYOUT.padding;

	/**
	 * Adds a rendered tier section to the SVG layout.
	 *
	 * @param {string} tier
	 * @param {{svg: string, height: number}} section
	 * @returns {void}
	 */
	function addSection(tier, section) {
		sections.push(section.svg);
		currentY += section.height;

		if (tier !== ALL_TIERS.at(-1)) {
			currentY += LAYOUT.sectionGap;
		}
	}

	// Platinum, Gold, Silver, and Bronze use visual sponsor cards.
	for (const tier of ["platinum", "gold", "silver", "bronze"]) {
		const entries = sponsors[tier] ?? [];
		const config = TIER_CONFIG[tier];

		const section = createTierSection(
			config.title,
			entries,
			currentY,
			canvasWidth,
			config,
		);

		addSection(tier, section);
	}

	// Builder and Supporter use left-aligned three-column name grids.
	for (const tier of ["builder", "supporter"]) {
		const entries = sponsors[tier] ?? [];

		const section = createNameTierSection(
			tier,
			entries,
			currentY,
			canvasWidth,
		);

		addSection(tier, section);
	}

	const canvasHeight = currentY + LAYOUT.padding;

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

			${sections.join("\n")}
		</svg>
	`;
}

/**
 * Generates the compact sponsor wall.
 *
 * All public sponsorship tiers are loaded so the resulting SVG remains the
 * single source of truth for the sponsor list displayed by BACKERS.md.
 *
 * @returns {Promise<void>}
 */
async function generateBackers() {
	const sponsors = await loadSponsors({
		tiers: ALL_TIERS,
	});

	const svg = createBackersSvg(sponsors);

	await fs.mkdir(path.dirname(BACKERS_SVG_FILE), {
		recursive: true,
	});

	await fs.writeFile(BACKERS_SVG_FILE, svg, "utf8");

	console.log(`Generated backers SVG: ${BACKERS_SVG_FILE}`);

	for (const tier of ALL_TIERS) {
		console.log(`${tier}: ${(sponsors[tier] ?? []).length}`);
	}
}

generateBackers().catch((error) => {
	console.error("[generate-backers] Failed:", error);
	process.exitCode = 1;
});
