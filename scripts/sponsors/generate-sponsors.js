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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPONSORS_FILE = path.resolve(__dirname, "./sponsors.json");

const OUTPUT_FILE = path.resolve(
	__dirname,
	"../../docs/public/sponsors/sponsors.svg",
);

const SITE_ORIGIN = "https://udodi.dev";

/**
 * Visual configuration for each sponsorship tier.
 *
 * Platinum sponsors receive larger cards and more visual space,
 * while Gold sponsors use a denser grid.
 *
 * @type {Object<string, {
 *   title: string,
 *   columns: number,
 *   cardWidth: number,
 *   cardHeight: number,
 *   gap: number
 * }>}
 */
const TIER_CONFIG = {
	platinum: {
		title: "Platinum Sponsors",
		columns: 3,
		cardWidth: 262.66,
		cardHeight: 147.75,
		gap: 12,
		padding: 10,
	},

	gold: {
		title: "Gold Sponsors",
		columns: 4,
		cardWidth: 194,
		cardHeight: 109.12,
		gap: 12,
		padding: 8,
	},
};

/**
 * Layout constants shared by all sponsorship tiers.
 *
 * @type {{padding: number, sectionGap: number, titleHeight: number}}
 */
const LAYOUT = {
	padding: 24,
	sectionGap: 36,
	titleHeight: 32,
};

/**
 * Image formats supported by the sponsor wall.
 *
 * The generated SVG uses an SVG `<image>` element, which can reference
 * browser-supported raster and vector image formats.
 *
 * @type {Set<string>}
 */
const SUPPORTED_LOGO_EXTENSIONS = new Set([
	".svg",
	".png",
	".jpg",
	".jpeg",
	".webp",
	".gif",
]);

/**
 * Escapes a value for safe inclusion in XML/SVG text or attributes.
 *
 * @param {*} value
 * @returns {string}
 */
function escapeXml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

/**
 * Validates and normalizes a sponsor URL.
 *
 * Only HTTP and HTTPS URLs are allowed.
 *
 * @param {string} value
 * @returns {string}
 * @throws {TypeError|Error}
 */
function normalizeSponsorUrl(value) {
	if (typeof value !== "string" || value.trim() === "") {
		throw new TypeError("Sponsor URL must be a non-empty string.");
	}

	const url = new URL(value);

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error(`Unsupported sponsor URL protocol "${url.protocol}".`);
	}

	return url.toString();
}

/**
 * Resolves and validates a sponsor logo URL.
 *
 * Supported logo formats:
 * - SVG
 * - PNG
 * - JPG/JPEG
 * - WebP
 * - GIF
 *
 * Logo paths in sponsors.json should normally be site-relative:
 *
 * `/sponsors/logos/company.svg`
 * `/sponsors/logos/company.png`
 * `/sponsors/logos/company.webp`
 *
 * Absolute HTTP(S) URLs are also accepted.
 *
 * @param {string} value
 * @returns {string}
 * @throws {TypeError|Error}
 */
function resolveLogoUrl(value) {
	if (typeof value !== "string" || value.trim() === "") {
		throw new TypeError(
			"Sponsor logo must be a non-empty string.",
		);
	}

	const logo = value.trim();
	const url = new URL(logo, SITE_ORIGIN);

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error(
			`Unsupported sponsor logo protocol "${url.protocol}".`,
		);
	}

	const extension = path.extname(url.pathname).toLowerCase();

	if (!SUPPORTED_LOGO_EXTENSIONS.has(extension)) {
		throw new Error(
			`Unsupported sponsor logo format "${extension || "unknown"}". ` +
			`Supported formats: ${Array.from(
				SUPPORTED_LOGO_EXTENSIONS,
			).join(", ")}`,
		);
	}

	return url.toString();
}

/**
 * Validates an individual sponsor entry.
 *
 * Sponsors marked as private or without approved logo usage are
 * retained in the manifest but excluded from the public sponsor wall.
 *
 * @param {*} sponsor
 * @param {string} tier
 * @param {number} index
 * @returns {{
 *   name: string,
 *   url: string,
 *   logo: string,
 *   public: boolean,
 *   logoApproved: boolean
 * }}
 */
function validateSponsor(sponsor, tier, index) {
	if (
		sponsor === null ||
		typeof sponsor !== "object" ||
		Array.isArray(sponsor)
	) {
		throw new TypeError(
			`Invalid ${tier} sponsor at index ${index}: ` + "expected an object.",
		);
	}

	const {
		name,
		url,
		logo,
		public: isPublic = true,
		logoApproved = true,
	} = sponsor;

	if (typeof name !== "string" || name.trim() === "") {
		throw new TypeError(
			`Invalid ${tier} sponsor at index ${index}: ` +
			`"name" must be a non-empty string.`,
		);
	}

	return {
		name: name.trim(),
		url: normalizeSponsorUrl(url),
		logo: resolveLogoUrl(logo),
		public: isPublic === true,
		logoApproved: logoApproved === true,
	};
}

/**
 * Loads and validates the sponsor manifest.
 *
 * @returns {Promise<{platinum: Object[], gold: Object[]}>}
 */
async function loadSponsors() {
	const content = await fs.readFile(SPONSORS_FILE, "utf8");

	let manifest;

	try {
		manifest = JSON.parse(content);
	} catch (error) {
		throw new Error(`Unable to parse "${SPONSORS_FILE}": ${error.message}`);
	}

	if (
		manifest === null ||
		typeof manifest !== "object" ||
		Array.isArray(manifest)
	) {
		throw new TypeError("Invalid sponsor manifest: expected an object.");
	}

	const sponsors = {};

	for (const tier of Object.keys(TIER_CONFIG)) {
		const entries = manifest[tier] ?? [];

		if (!Array.isArray(entries)) {
			throw new TypeError(`Invalid "${tier}" sponsors: expected an array.`);
		}

		sponsors[tier] = entries
			.map((sponsor, index) => validateSponsor(sponsor, tier, index))
			.filter((sponsor) => sponsor.public && sponsor.logoApproved)
			.sort((a, b) =>
				a.name.localeCompare(b.name, undefined, {
					sensitivity: "base",
				}),
			);
	}

	return sponsors;
}

/**
 * Creates a sponsor logo card.
 *
 * Platinum cards are intentionally larger than Gold cards.
 * The logo is centered inside the card while preserving its
 * original aspect ratio.
 *
 * @param {Object} sponsor
 * @param {number} x
 * @param {number} y
 * @param {Object} config
 * @param {boolean} [isGold=false]
 * @returns {string}
 */
function createSponsorCard(
	sponsor,
	x,
	y,
	config,
	isGold = false,
) {
	const { cardWidth, cardHeight } = config;
	const padding = isGold ? TIER_CONFIG.gold.padding : TIER_CONFIG.platinum.padding;
	const logoWidth = cardWidth - padding * 2;
	const logoHeight = cardHeight - padding * 2;

	return `
		<a
			href="${escapeXml(sponsor.url)}"
			target="_blank"
			rel="noopener noreferrer"
		>
			<title>${escapeXml(sponsor.name)}</title>

			<rect
				x="${x}"
				y="${y}"
				width="${cardWidth}"
				height="${cardHeight}"
				rx="6"
				fill="#ffffff"
				stroke="#d0d7de"
				stroke-width="1"
			/>

			<image
				x="${x + padding}"
				y="${y + padding}"
				width="${logoWidth}"
				height="${logoHeight}"
				href="${escapeXml(sponsor.logo)}"
				preserveAspectRatio="xMidYMid meet"
			/>
		</a>
	`;
}

/**
 * Creates an empty-state message for a sponsorship tier.
 *
 * @param {number} width
 * @param {number} y
 * @returns {string}
 */
function createEmptyTier(width, y) {
	return `
		<text
			x="${width / 2}"
			y="${y}"
			text-anchor="middle"
			font-family="-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Helvetica, Arial, sans-serif"
			font-size="12"
			fill="#8c959f"
		>
			No sponsors yet
		</text>
	`;
}

/**
 * Creates a complete sponsorship tier section.
 *
 * Each section contains a left-aligned tier title followed by
 * a centered sponsor grid. Tier separation is provided by
 * typography and vertical spacing rather than a divider.
 *
 * Platinum uses larger cards while Gold uses a denser layout.
 *
 * @param {string} tier
 * @param {Object[]} sponsors
 * @param {number} y
 * @param {number} canvasWidth
 * @returns {{
 *   svg: string,
 *   height: number
 * }}
 */
function createTierSection(tier, sponsors, y, canvasWidth) {
	const config = TIER_CONFIG[tier];

	const {
		title,
		columns,
		cardWidth,
		cardHeight,
		gap,
	} = config;

	const titleHeight = 20;
	const titleToGridGap = 14;
	const gridWidth = columns * cardWidth + (columns - 1) * gap;
	const rows = Math.max(1, Math.ceil(sponsors.length / columns));
	const gridHeight = rows * cardHeight + (rows - 1) * gap;
	const sectionHeight = titleHeight + titleToGridGap + gridHeight;
	const contentX = (canvasWidth - gridWidth) / 2; // Exact left starting coordinate of the grid (74px)
	const titleY = y + 14;

	let content = `
		<text
			x="${contentX}"
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
			y + titleHeight + titleToGridGap + 12,
		);

		return {
			svg: content,
			height: titleHeight + titleToGridGap + 34,
		};
	}

	for (let i = 0; i < sponsors.length; i++) {
		const column = i % columns;
		const row = Math.floor(i / columns);
		const x = contentX + column * (cardWidth + gap);

		const cardY =
			y +
			titleHeight +
			titleToGridGap +
			row * (cardHeight + gap);

		content += createSponsorCard(
			sponsors[i],
			x,
			cardY,
			config,
			tier === "gold",
		);
	}

	return {
		svg: content,
		height: sectionHeight,
	};
}

/**
 * Generates the complete combined sponsor SVG.
 *
 * Platinum sponsors are rendered first with larger cards.
 * Gold sponsors follow in a denser grid.
 *
 * If both tiers are empty, it returns a transparent 1x1 placeholder
 * to seamlessly hide the image element in the Markdown file.
 *
 * @param {{platinum: Object[], gold: Object[]}} sponsors
 * @returns {string}
 */
function createSponsorSvg(sponsors) {
	// The Invisible Placeholder Trick: If no backers exist, disappear completely.
	if (sponsors.platinum.length === 0 && sponsors.gold.length === 0) {
		return `
			<svg xmlns="http://www.w3.org/2000/svg" width="1" height="0" viewBox="0 0 1 0" opacity="0">
		    	<title>Udodi Sponsors</title>
			</svg>
		`;
	}

	const canvasWidth = 900;

	const platinumSection = createTierSection(
		"platinum",
		sponsors.platinum,
		LAYOUT.padding,
		canvasWidth,
	);

	const goldY = LAYOUT.padding + platinumSection.height + LAYOUT.sectionGap;

	const goldSection = createTierSection(
		"gold",
		sponsors.gold,
		goldY,
		canvasWidth,
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
	await fs.mkdir(path.dirname(OUTPUT_FILE), {
		recursive: true,
	});

	await fs.writeFile(OUTPUT_FILE, svg, "utf8");

	console.log(`Generated sponsor wall: ${OUTPUT_FILE}`);
}

/**
 * Generates the combined Udodi sponsor wall.
 *
 * @returns {Promise<void>}
 */
async function generateSponsors() {
	const sponsors = await loadSponsors();
	const svg = createSponsorSvg(sponsors);

	await writeSponsorSvg(svg);

	console.log(`Platinum sponsors: ${sponsors.platinum.length}`);
	console.log(`Gold sponsors: ${sponsors.gold.length}`);
}

generateSponsors().catch((error) => {
	console.error("[generate-sponsors] Failed:", error);

	process.exitCode = 1;
});
