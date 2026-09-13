/**
 * @fileoverview Shared utilities for Udodi sponsor wall and backers generators.
 *
 * Used by both `generate-sponsors.js` (full-size wall for README / site)
 * and `generate-backers.js` (tighter, smaller wall + BACKERS.md).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Absolute path to the sponsors manifest. */
export const SPONSORS_FILE = path.resolve(__dirname, "../../docs/public/sponsors.json");

/** Base directory for resolving local (relative) logo paths. */
export const PUBLIC_DIR = path.dirname(SPONSORS_FILE);

/** Site origin used when turning relative logo paths into absolute URLs (for remote fallback). */
export const SITE_ORIGIN = "https://udodi.dev";

/**
 * Image formats supported by the sponsor wall.
 * @type {Set<string>}
 */
export const SUPPORTED_LOGO_EXTENSIONS = new Set([
	".svg",
	".png",
	".jpg",
	".jpeg",
	".webp",
	".gif",
]);

/**
 * All sponsorship tiers in hierarchical order (highest first).
 * Visual SVG wall currently renders only platinum + gold.
 * @type {string[]}
 */
export const ALL_TIERS = [
	"platinum",
	"gold",
	"silver",
	"bronze",
	"builder",
	"supporter",
];

/**
 * Human-readable titles for each tier.
 * @type {Object<string, string>}
 */
export const TIER_TITLES = {
	platinum: "Platinum Sponsors",
	gold: "Gold Sponsors",
	silver: "Silver Sponsors",
	bronze: "Bronze Sponsors",
	builder: "Builder Sponsors",
	supporter: "Supporter Sponsors",
};

/**
 * Escapes a value for safe inclusion in XML/SVG text or attributes.
 * @param {*} value
 * @returns {string}
 */
export function escapeXml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

/**
 * Escapes a string so it can be safely embedded in a RegExp pattern.
 * @param {string} value
 * @returns {string}
 */
export function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Validates and normalizes a sponsor URL.
 * Only HTTP and HTTPS URLs are allowed.
 * @param {string} value
 * @returns {string}
 * @throws {TypeError|Error}
 */
export function normalizeSponsorUrl(value) {
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
 * Resolves and validates a sponsor logo path or URL.
 *
 * - Absolute http(s) URLs are validated and returned as-is (downloaded at build time).
 * - Relative / root-relative paths (e.g. `/sponsors/logos/example.png`) are kept as local
 *   paths and later resolved against the docs/public directory.
 *
 * Supported logo formats:
 * - SVG
 * - PNG
 * - JPG/JPEG
 * - WebP
 * - GIF
 *
 * @param {string} value
 * @returns {string} Either a full http(s) URL or a local path string (starting with / or relative)
 * @throws {TypeError|Error}
 */
function resolveLogoUrl(value) {
	if (typeof value !== "string" || value.trim() === "") {
		throw new TypeError("Sponsor logo must be a non-empty string.");
	}

	const logo = value.trim();

	// Absolute remote URL --> validate protocol and extension, return full URL
	if (/^https?:\/\//i.test(logo)) {
		const url = new URL(logo);

		if (url.protocol !== "https:" && url.protocol !== "http:") {
			throw new Error(`Unsupported sponsor logo protocol "${url.protocol}".`);
		}

		const extension = path.extname(url.pathname).toLowerCase();

		if (!SUPPORTED_LOGO_EXTENSIONS.has(extension)) {
			throw new Error(
				`Unsupported sponsor logo format "${extension || "unknown"}". ` +
				`Supported formats: ${Array.from(SUPPORTED_LOGO_EXTENSIONS).join(", ")}`,
			);
		}

		return url.toString();
	}

	// Local / relative path (e.g. /sponsors/logos/example.png or sponsors/logos/foo.svg)
	const extension = path.extname(logo).toLowerCase();

	if (!SUPPORTED_LOGO_EXTENSIONS.has(extension)) {
		throw new Error(
			`Unsupported sponsor logo format "${extension || "unknown"}". ` +
			`Supported formats: ${Array.from(SUPPORTED_LOGO_EXTENSIONS).join(", ")}`,
		);
	}

	return logo;
}

/**
 * Validates an individual sponsor entry.
 *
 * Sponsors marked as private or without approved logo usage are
 * retained in the manifest but excluded from public surfaces.
 *
 * Logo is optional for lower tiers (builder / supporter) that only need names.
 *
 * @param {*} sponsor
 * @param {string} tier
 * @param {number} index
 * @param {{requireLogo?: boolean}} [options]
 * @returns {{
 *   name: string,
 *   url: string,
 *   logo: string | null,
 *   public: boolean,
 *   logoApproved: boolean
 * }}
 */
export function validateSponsor(sponsor, tier, index, options = {}) {
	const { requireLogo = true } = options;

	if (sponsor === null || typeof sponsor !== "object" || Array.isArray(sponsor)) {
		throw new TypeError(`Invalid ${tier} sponsor at index ${index}: expected an object.`);
	}

	const { name, url, logo, public: isPublic = true, logoApproved = true } = sponsor;

	if (typeof name !== "string" || name.trim() === "") {
		throw new TypeError(`Invalid ${tier} sponsor at index ${index}: "name" must be a non-empty string.`);
	}

	const result = {
		name: name.trim(),
		url: normalizeSponsorUrl(url),
		logo: null,
		public: isPublic === true,
		logoApproved: logoApproved === true,
	};

	if (logo !== undefined && logo !== null && String(logo).trim() !== "") {
		result.logo = resolveLogoUrl(logo);

	} else if (requireLogo) {
		throw new TypeError(`Invalid ${tier} sponsor at index ${index}: "logo" is required.`);
	}

	return result;
}

/**
 * Scopes internal IDs, asset references, and CSS selectors inside an SVG string
 * to prevent conflicting global namespace collisions across multiple sponsor items.
 *
 * @param {string} svgText The raw SVG inner body string content.
 * @param {string} prefix A unique alpha-numeric namespace seed value.
 * @returns {string} The scoped and prefix-isolated SVG string content.
 */
function scopeSvgIdsAndStyles(svgText, prefix) {
	let scopedContent = svgText;

	// Discover all unique attribute id="xyz" string definitions
	const idRegex = /\bid=["']([^"']+)["']/g;
	const detectedIds = new Set();
	let match;

	while ((match = idRegex.exec(svgText)) !== null) {
		detectedIds.add(match[1]);
	}

	// Perform global variable replacements for detected IDs and their functional mappings
	for (const id of detectedIds) {
		const scopedId = `${prefix}-${id}`;
		const escapedId = escapeRegExp(id);

		// Target explicit id parameters (word-boundary + proper escaping)
		scopedContent = scopedContent.replace(
			new RegExp(`\\bid=["']${escapedId}["']`, "g"),
			`id="${scopedId}"`,
		);

		// Target functional reference patterns: url(#id)
		scopedContent = scopedContent.replace(
			new RegExp(`url\\(#${escapedId}\\)`, "g"),
			`url(#${scopedId})`,
		);

		// Target explicit anchor attributes: href="#id" or xlink:href="#id"
		scopedContent = scopedContent.replace(
			new RegExp(`(?:xlink:)?href=["']#${escapedId}["']`, "g"),
			`href="#${scopedId}"`,
		);
	}

	// Namespace internal structural CSS class rules: .name --> .prefix-name
	scopedContent = scopedContent.replace(/<style([\s\S]*?)>([\s\S]*?)<\/style>/gi, (styleTag, attrs, cssBody) => {
		let scopedCss = cssBody;

		// Catch simple class layouts (e.g., .cls-1 or .st0) inside vector stylesheet definitions
		scopedCss = scopedCss.replace(/\.([a-z0-9_-]+)(\s*[,{])/gi, (match, className, tail) => {
			return `.${prefix}-${className}${tail}`;
		});

		return `<style${attrs}>${scopedCss}</style>`;
	});

	// Update individual structural tag class references matching newly scoped styling rules
	scopedContent = scopedContent.replace(/\bclass=["']([^"']+)["']/g, (match, classAttrValue) => {
		const scopedClasses = classAttrValue
			.split(/\s+/)
			.map(c => c.trim() ? `${prefix}-${c}` : "")
			.filter(Boolean)
			.join(" ");
		
		return `class="${scopedClasses}"`;
	});

	return scopedContent;
}

/**
 * Loads a logo asset (remote or local) and compiles it to a fully self-contained payload.
 * Vector files are parsed to extract their original dimensions and viewBox before stripping
 * vendor components.
 *
 * - Absolute http(s) URLs are downloaded via fetch.
 * - Relative / root-relative paths are read from the local filesystem under docs/public.
 *
 * @param {string} logoUrl  Full http(s) URL or local path string
 * @param {string} scopePrefix A unique alpha-numeric prefix code to prevent ID collisions.
 * @returns {Promise<{type: "svg" | "raster", content: string, viewBox?: string, width?: string, height?: string}>}
 */
export async function processSponsorLogo(logoUrl, scopePrefix) {
	const isRemote = /^https?:\/\//i.test(logoUrl);
	let rawSvgText;
	let extension;
	let arrayBuffer;

	if (isRemote) {
		const response = await fetch(logoUrl);

		if (!response.ok) {
			throw new Error(`Failed to download logo asset from endpoint: ${logoUrl} (${response.statusText})`);
		}

		const parsedUrl = new URL(logoUrl);
		extension = path.extname(parsedUrl.pathname).toLowerCase();

		if (extension === ".svg") {
			rawSvgText = await response.text();
		} else {
			arrayBuffer = await response.arrayBuffer();
		}

	} else {
		// Local path: resolve against docs/public
		const relative = logoUrl.replace(/^\//, "");
		const localPath = path.resolve(PUBLIC_DIR, relative);

		// Safety: ensure the resolved path stays inside PUBLIC_DIR
		if (!localPath.startsWith(PUBLIC_DIR + path.sep) && localPath !== PUBLIC_DIR) {
			throw new Error(`Logo path escapes public directory: ${logoUrl}`);
		}

		extension = path.extname(localPath).toLowerCase();

		try {
			if (extension === ".svg") {
				rawSvgText = await fs.readFile(localPath, "utf8");
			} else {
				const buffer = await fs.readFile(localPath);
				arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
			}

		} catch (err) {
			throw new Error(`Failed to read local logo asset: ${localPath} (${err.message})`);
		}
	}

	if (extension === ".svg") {
		// Capture the original attributes safely using targeted regex capture groups
		const widthMatch = rawSvgText.match(/<svg[^>]*\bwidth=["']([^"']+)["']/i);
		const heightMatch = rawSvgText.match(/<svg[^>]*\bheight=["']([^"']+)["']/i);
		const viewBoxMatch = rawSvgText.match(/<svg[^>]*\bviewBox=["']([^"']+)["']/i);

		let rawWidth = widthMatch ? widthMatch[1] : null;
		let rawHeight = heightMatch ? heightMatch[1] : null;
		let logoViewBox = viewBoxMatch ? viewBoxMatch[1] : null;

		// Editor Resiliency Fallback Engine: Handle missing viewBox definitions
		if (!logoViewBox && rawWidth && rawHeight) {
			const cleanW = rawWidth.replace(/[^\d.]/g, "");
			const cleanH = rawHeight.replace(/[^\d.]/g, "");
			if (cleanW && cleanH) {
				logoViewBox = `0 0 ${cleanW} ${cleanH}`;
			}
		}

		// Remove XML declarations, DOCTYPE headers, and editor comments safely
		rawSvgText = rawSvgText
			.replace(/<\?xml[^>]*\?>/gi, "")
			.replace(/<!DOCTYPE[^>]*>/gi, "")
			.replace(/<!--[\s\S]*?-->/g, "");

		// Strip out multi-editor proprietary metadata panels and workspaces
		rawSvgText = rawSvgText
			.replace(/<sodipodi:namedview[\s\S]*?<\/sodipodi:namedview>/gi, "") // Inkscape
			.replace(/<metadata[\s\S]*?<\/metadata>/gi, "")                     // Inkscape / W3C
			.replace(/<i:pgf[\s\S]*?<\/i:pgf>/gi, "")                           // Illustrator Layer Matrix
			.replace(/<sketch:type[\s\S]*?<\/sketch:type>/gi, "");              // Sketch App Elements

		// Extract the inner graphical payload by isolating content inside the root <svg> tags
		const svgMatch = rawSvgText.match(/<svg[^>]*>([\s\S]*?)<\/svg>\s*$/i);
		if (!svgMatch) {
			throw new Error(`Invalid SVG file format encountered at: ${logoUrl}`);
		}

		let innerSvgBody = svgMatch[1].trim();

		// Clean nested metadata namespaces from internal element trees
		innerSvgBody = innerSvgBody
			.replace(/\binkscape:[a-z0-9-]+="[^"]*"/gi, "")
			.replace(/\bsodipodi:[a-z0-9-]+="[^"]*"/gi, "")
			.replace(/\bsketch:[a-z0-9-]+="[^"]*"/gi, "");

		// Inject defensive scoping to fully isolate styles and gradient definition mappings
		const finalizedSvgBody = scopeSvgIdsAndStyles(innerSvgBody, scopePrefix);

		return {
			type: "svg",
			content: finalizedSvgBody,
			viewBox: logoViewBox || `0 0 100 100`,
			width: rawWidth,
			height: rawHeight,
		};
	}

	const buffer = Buffer.from(arrayBuffer);
	let mimeType = "image/png";

	if (extension === ".jpg" || extension === ".jpeg") mimeType = "image/jpeg";
	else if (extension === ".webp") mimeType = "image/webp";
	else if (extension === ".gif") mimeType = "image/gif";

	const base64Content = buffer.toString("base64");
	return { type: "raster", content: `data:${mimeType};base64,${base64Content}` };
}

/**
 * Loads and validates the sponsor manifest.
 *
 * Visual tiers (platinum / gold) require a logo.
 * Lower tiers (silver and below) treat logo as optional.
 *
 * @param {Object} [options]
 * @param {string[]} [options.tiers]  Which tiers to load (default: ALL_TIERS)
 * @param {boolean} [options.requireLogoForVisual=true]
 * @returns {Promise<Object<string, Object[]>>}
 */
export async function loadSponsors(options = {}) {
	const {
		tiers = ALL_TIERS,
		requireLogoForVisual = true,
	} = options;

	const content = await fs.readFile(SPONSORS_FILE, "utf8");
	let manifest;

	try {
		manifest = JSON.parse(content);
	} catch (error) {
		throw new Error(`Unable to parse "${SPONSORS_FILE}": ${error.message}`);
	}

	if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
		throw new TypeError("Invalid sponsor manifest: expected an object.");
	}

	const sponsors = {};
	let uniqueIdCounter = 0;

	for (const tier of tiers) {
		const entries = manifest[tier] ?? [];

		if (!Array.isArray(entries)) {
			throw new TypeError(`Invalid "${tier}" sponsors: expected an array.`);
		}

		const isVisualTier = tier === "platinum" || tier === "gold";
		const requireLogo = requireLogoForVisual && isVisualTier;

		const filtered = entries
			.map((sponsor, index) => validateSponsor(sponsor, tier, index, { requireLogo }))
			.filter((sponsor) => sponsor.public && (isVisualTier ? sponsor.logoApproved : true))
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

		sponsors[tier] = [];
		for (const sponsor of filtered) {
			uniqueIdCounter++;
			const scopePrefix = `sp${uniqueIdCounter}`;

			if (sponsor.logo) {
				console.log(`Loading asset dependency [${scopePrefix}]: ${sponsor.logo}`);

				try {
					const processedLogo = await processSponsorLogo(sponsor.logo, scopePrefix);
					sponsors[tier].push({ ...sponsor, processedLogo, scopePrefix });
					
				} catch (err) {
					console.error(`Warning: Skipping sponsor "${sponsor.name}" due to download/parsing failure:`, err.message);
				}

			} else {
				// Name-only entry (builder / supporter / etc.)
				sponsors[tier].push({ ...sponsor, processedLogo: null, scopePrefix });
			}
		}
	}

	return sponsors;
}

/**
 * Creates a standalone decorative sponsor card (no interactive links).
 *
 * @param {Object} sponsor
 * @param {number} x
 * @param {number} y
 * @param {Object} config  { cardWidth, cardHeight, padding }
 * @returns {string}
 */
export function createSponsorCard(sponsor, x, y, config) {
	const { cardWidth, cardHeight, padding } = config;
	const logoWidth = cardWidth - padding * 2;
	const logoHeight = cardHeight - padding * 2;

	let logoRenderingPayload = "";

	if (sponsor.processedLogo?.type === "svg") {
		const targetViewBox = sponsor.processedLogo.viewBox || `0 0 ${logoWidth} ${logoHeight}`;

		logoRenderingPayload = `
			<svg 
				x="${x + padding}" 
				y="${y + padding}" 
				width="${logoWidth}" 
				height="${logoHeight}" 
				viewBox="${targetViewBox}" 
				preserveAspectRatio="xMidYMid meet"
			>
				${sponsor.processedLogo.content}
			</svg>
		`;
		
	} else if (sponsor.processedLogo?.type === "raster") {
		logoRenderingPayload = `
			<image
				x="${x + padding}" y="${y + padding}" width="${logoWidth}" height="${logoHeight}"
				href="${escapeXml(sponsor.processedLogo.content)}"
				preserveAspectRatio="xMidYMid meet"
			/>
		`;
	}

	return `
		<g id="sponsor-${escapeXml(sponsor.name.toLowerCase().replace(/\s+/g, "-"))}">
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

			${logoRenderingPayload}
		</g>
	`;
}

/**
 * Creates an empty-state message for a sponsorship tier.
 *
 * @param {number} width
 * @param {number} y
 * @returns {string}
 */
export function createEmptyTier(width, y) {
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
 * Creates a complete sponsorship tier section (title + grid of cards).
 *
 * @param {string} title
 * @param {Object[]} sponsors
 * @param {number} y
 * @param {number} canvasWidth
 * @param {Object} config  { columns, cardWidth, cardHeight, gap, padding }
 * @returns {{ svg: string, height: number }}
 */
export function createTierSection(title, sponsors, y, canvasWidth, config) {
	const { columns, cardWidth, cardHeight, gap } = config;

	const titleHeight = 20;
	const titleToGridGap = 14;
	const gridWidth = columns * cardWidth + (columns - 1) * gap;
	const rows = Math.max(1, Math.ceil(sponsors.length / columns));
	const gridHeight = rows * cardHeight + (rows - 1) * gap;
	const sectionHeight = titleHeight + titleToGridGap + gridHeight;
	const contentX = (canvasWidth - gridWidth) / 2;
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
		content += createEmptyTier(canvasWidth, y + titleHeight + titleToGridGap + 12);

		return {
			svg: content,
			height: titleHeight + titleToGridGap + 34,
		};
	}

	for (let i = 0; i < sponsors.length; i++) {
		const column = i % columns;
		const row = Math.floor(i / columns);
		const x = contentX + column * (cardWidth + gap);
		const cardY = y + titleHeight + titleToGridGap + row * (cardHeight + gap);

		content += createSponsorCard(sponsors[i], x, cardY, config);
	}

	return {
		svg: content,
		height: sectionHeight,
	};
}
