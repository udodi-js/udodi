import { defineConfig } from "vitepress";
import fs from 'node:fs';
import path from 'node:path';

/**
 * Build a short meta description from a Markdown page body.
 *
 * Strategy:
 * 1. Strip frontmatter and fenced code blocks from the full document.
 * 2. Walk paragraph blocks until one has enough prose (≥ 40 chars after clean).
 * 3. If that block ends with ":", append the following list block(s) as a comma-separated list.
 * 4. Prefer the first real sentence; otherwise truncate with "...".
 *
 * Notes:
 * - Inline code keeps its inner text so directives like @style stay visible.
 * - Hyphens in words (fine-grained) are preserved; only emphasis markers are stripped.
 * - Ordered/bullet list markers become commas for a readable one-line summary.
 */
function buildAutoDescription(markdown) {
	if (!markdown) return null

	// Remove YAML frontmatter and fenced code (keep surrounding prose only)
	let body = markdown
		.replace(/^---[\s\S]*?---\n?/, '')
		.replace(/```[\s\S]*?```/g, ' ')

	const blocks = body.split(/\n\s*\n/)

	let text = ''
	for (let i = 0; i < blocks.length; i++) {
		const candidate = cleanBlock(blocks[i])
		if (!candidate || candidate.length < 40) continue

		text = candidate

		// If the paragraph ends with a colon, append the following 
		// list block(s) as a comma-separated list.
		if (/:\s*$/.test(candidate)) {
			const listParts = []
			for (let j = i + 1; j < blocks.length; j++) {
				const raw = blocks[j]
				const isList = /^\s*\d+\.\s+/m.test(raw) || /^\s*[-*+]\s+/m.test(raw)

				if (!isList) break

				const itemText = cleanBlock(raw)
				if (itemText) listParts.push(itemText)
			}

			if (listParts.length) {
				const list = listParts.join(', ').replace(/^,\s*/, '')
				text = candidate.replace(/:\s*$/, ': ') + list

				if (!/[.!?]$/.test(text)) text += '.'
			}
		}

		break
	}

	if (!text || text.length < 40) return null

	// Prefer a complete sentence; avoid treating "1." as a sentence end
	const match = text.match(/^(.{40,180}?(?<!\d)[.!?])(?:\s|$)/)
	let desc = match ? match[1] : text.slice(0, 150).trim() + '...'

	if (desc.length > 155) {
		desc = desc.slice(0, 152).trim() + '...'
	}

	return desc
}

/**
 * Normalize one Markdown block into plain text for meta use.
 * Preserves @directive names and hyphenated words.
 */
function cleanBlock(block) {
	return block
		// Keep inline code content (e.g. `@style` → @style), do not drop it
		.replace(/`([^`\n]+)`/g, '$1')
		.replace(/<[^>]+>/g, ' ')

		// Drop heading lines entirely
		.replace(/^#{1,6}\s+.+$/gm, ' ')

		// Convert structural list markers to commas with spaces
		.replace(/^\s*\d+\.\s+/gm, ', ')
		.replace(/^\s*[-*+]\s+/gm, ', ')

		// Links: keep label only
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

		// Emphasis / blockquote markers only, do not strip "-" or "@"
		.replace(/[*_~|>]/g, ' ')
		.replace(/\s+/g, ' ')
		.replace(/\s+([.,!?;:])/g, '$1')

		// Collapse commas and whitespace, remove leading/trailing punctuation
		.replace(/([:./?])\s*,\s*/g, '$1 ')
		.replace(/,\s*,/g, ',')
		.replace(/,\s*\./g, '.')
		.replace(/^,?\s*/, '')
		.trim()
}

export default defineConfig({
	title: "Udodi",
	description: "Udodi is a lightweight, zero-dependency reactive JavaScript UI framework with fine-grained reactivity, a declarative HTML DSL, and a component-first architecture.",
	
	// This function is called for every page and allows us to automatically generate a 
	// description for pages that don't have one in their frontmatter.
	transformPageData(pageData, ctx) {
		if (
			pageData.relativePath === 'index.md' ||
			pageData.frontmatter.description
		) {
			return
		}

		const filePath = path.join(ctx.siteConfig.srcDir, pageData.relativePath)

		let markdown = ''
		try {
			markdown = fs.readFileSync(filePath, 'utf-8')
		} catch {
			return
		}

		const autoDescription = buildAutoDescription(markdown)
		if (!autoDescription) return

		return {
			description: autoDescription,
			frontmatter: {
				...pageData.frontmatter,
				description: autoDescription
			}
		}
	},

	ignoreDeadLinks: true, // Still writing the docs, so some links may be dead for now. This will be removed once the docs are complete.
	vite: {
        build: {
            chunkSizeWarningLimit: 1500,
        },
    },
	base: "/",
	sitemap: {
		hostname: "https://udodi.dev",
		transformItems: (items) => items.filter((item) => !item.url.startsWith("/sponsor/")),
	},
	head: [
		// Favicon
		[
			"link",
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
		],

		[
			"meta",
			{
				name: "keywords",
				content: "udodi, javascript, reactive, framework, ui, fine-grained reactivity, declarative dsl, no virtual dom, components, store, query pool, form system, overlay, zero dependencies, csp-friendly",
			},
		],
		["meta", { name: "author", content: "Udodi" }],

		// Open Graph (Facebook, LinkedIn, Discord, Slack, etc.)
		["meta", { property: "og:type", content: "website" }],
		["meta", { property: "og:site_name", content: "Udodi" }],
		["meta", { property: "og:locale", content: "en_US" }],
		["meta", { property: "og:url", content: "https://udodi.dev" }],
		[
			"meta",
			{
				property: "og:title",
				content: "Udodi - Lightweight Reactive JavaScript Framework",
			},
		],
		[
			"meta",
			{
				property: "og:description",
				content: "A lightweight, zero-dependency reactive UI runtime with fine-grained reactivity, declarative HTML templates, and a minimal component API. No Virtual DOM, no JSX.",
			},
		],
		[
			"meta",
			{
				property: "og:image",
				content: "https://udodi.dev/udodi-logo.png",
			},
		],
		["meta", { property: "og:image:width", content: "400" }],
		["meta", { property: "og:image:height", content: "400" }],
		[
			"meta",
			{
				property: "og:image:alt",
				content: "Udodi - Lightweight Reactive JavaScript Framework",
			},
		],

		// Twitter Card
		["meta", { name: "twitter:card", content: "summary" }],
		["meta", { name: "twitter:site", content: "@udodi_js" }],
		[
			"meta",
			{
				name: "twitter:title",
				content: "Udodi - Lightweight Reactive JavaScript Framework",
			},
		],
		[
			"meta",
			{
				name: "twitter:description",
				content: "A lightweight, zero-dependency reactive UI runtime with fine-grained reactivity and a declarative HTML DSL. No Virtual DOM, no JSX.",
			},
		],
		[
			"meta",
			{
				name: "twitter:image",
				content: "https://udodi.dev/udodi-logo.png",
			},
		],
		[
			"meta",
			{
				name: "twitter:image:alt",
				content: "Udodi - Lightweight Reactive JavaScript Framework",
			},
		],

		[
			"script",
			{
				type: "application/ld+json",
			},
			JSON.stringify({
				"@context": "https://schema.org",
				"@graph": [
					{
						"@type": "Organization",
						"@id": "https://udodi.dev/#organization",
						name: "Udodi",
						url: "https://udodi.dev/",
						logo: "https://udodi.dev/udodi-logo.svg",
						description: "Udodi is a lightweight, zero-dependency reactive JavaScript UI framework with fine-grained reactivity, a declarative HTML DSL, and a component-first architecture.",
						sameAs: [
							"https://github.com/udodi-js/udodi",
							"https://github.com/sponsors/udodi-js",
							"https://www.npmjs.com/package/udodi",
							"https://x.com/udodi_js",
							"https://www.linkedin.com/company/udodi",
						],
					},
					{
						"@type": "SoftwareApplication",
						"@id": "https://udodi.dev/#software",
						name: "Udodi",
						url: "https://udodi.dev/",
						description: "A lightweight, zero-dependency reactive JavaScript UI framework with fine-grained reactivity, a declarative HTML DSL, and a component-first architecture.",
						applicationCategory: "DeveloperApplication",
						operatingSystem: "Cross-platform",
						softwareRequirements: "JavaScript",
						publisher: {
							"@id": "https://udodi.dev/#organization",
						},
					},
				],
			}),
		],

		// Canonical
		["link", { rel: "canonical", href: "https://udodi.dev" }],
	],
	themeConfig: {
		logo: "/favicon.svg",
		nav: [
			{ text: "Guide", link: "/" },
			{ text: "Performance", link: "/performance" },
			{ text: "GitHub", link: "https://github.com/udodi-js/udodi" },
		],
		sidebar: [
			{
				text: "Introduction",
				items: [
					{ text: "Installation", link: "/installation" },
					{ text: "Quick Start", link: "/quick-start" },
					{ text: "Your First Component", link: "/first-component" },
					{ text: "Project Structure", link: "/project-structure" },
				],
			},
			{
				text: "Fundamentals",
				items: [
					{ text: "Components", link: "/fundamentals/components" },
					{ text: "State", link: "/fundamentals/state" },
					{ text: "Methods", link: "/fundamentals/methods" },
					{ text: "Computed Values", link: "/fundamentals/computed" },
					{ text: "Watchers", link: "/fundamentals/watch" },
					{ text: "Interceptors", link: "/fundamentals/interceptors" },
					{ text: "Lifecycle", link: "/fundamentals/lifecycle" },
					{ text: "Props", link: "/fundamentals/props" },
					{ text: "Context", link: "/fundamentals/context" },
					{ text: "Component Styles", link: "/fundamentals/styles" },
				],
			},
			{
				text: "Templates",
				items: [
					{ text: "Overview", link: "/templates/" },
					{ text: "DSL", link: "/templates/dsl" },
					{ text: "Text", link: "/templates/text" },
					{ text: "Binding", link: "/templates/bind" },
					{ text: "Events", link: "/templates/on" },
					{ text: "References", link: "/templates/ref" },
					{ text: "Conditional Rendering", link: "/templates/if" },
					{ text: "Visibility", link: "/templates/show" },
					{ text: "Lists", link: "/templates/for" },
					{ text: "Classes", link: "/templates/class" },
					{ text: "Styles", link: "/templates/style" },
					{ text: "Attributes", link: "/templates/attr" },
					{ text: "Teleport", link: "/templates/teleport" },
				],
			},
			{
				text: "Forms",
				items: [
					{ text: "Overview", link: "/forms/" },
					{ text: "Creating a Form", link: "/forms/creating" },
					{ text: "Fields", link: "/forms/fields" },
					{ text: "Validation", link: "/forms/validation" },
					{
						text: "Sequential and Parallel Validation",
						link: "/forms/sequential-parallel",
					},
					{ text: "Submission", link: "/forms/submission" },
					{ text: "Controllers", link: "/forms/controllers" },
					{ text: "Async Validation", link: "/forms/async" },
				],
			},
			{
				text: "Reactivity",
				items: [
					{ text: "Overview", link: "/reactivity/" },
					{ text: "Signals", link: "/reactivity/signals" },
					{ text: "Effects", link: "/reactivity/effects" },
					{ text: "Reactive State", link: "/reactivity/state" },
					{ text: "Reactive Collections", link: "/reactivity/collections" },
					{ text: "Using touch()", link: "/reactivity/touch" },
				],
			},
			{
				text: "Udodi Store",
				items: [
					{ text: "Overview", link: "/store/" },
					{ text: "Creating Stores", link: "/store/creating" },
					{ text: "Registry", link: "/store/registry" },
					{ text: "Persistence", link: "/store/persistence" },
				],
			},
			{
				text: "Query Pool",
				items: [
					{ text: "Overview", link: "/query-pool/" },
					{ text: "Queries", link: "/query-pool/queries" },
					{ text: "Query Lifecycle", link: "/query-pool/lifecycle" },
					{ text: "Registry", link: "/query-pool/registry" },
					{ text: "Mutations", link: "/query-pool/mutations" },
					{ text: "Dependencies", link: "/query-pool/dependencies" },
					{ text: "Caching", link: "/query-pool/caching" },
					{ text: "Invalidation", link: "/query-pool/invalidation" },
					{ text: "Cancellation", link: "/query-pool/cancellation" },
					{ text: "Transferable Data", link: "/query-pool/transfers" },
					{ text: "Workers", link: "/query-pool/workers" },
				],
			},
			{
				text: "Overlay",
				items: [
					{ text: "Overview", link: "/overlay/" },
					{ text: "Opening", link: "/overlay/opening" },
					{ text: "Closing", link: "/overlay/closing" },
					{ text: "Options", link: "/overlay/options" },
					{ text: "Stacking", link: "/overlay/stacking" },
					{ text: "Accessibility", link: "/overlay/accessibility" },
				],
			},
			{
				text: "Advanced",
				items: [
					{ text: "Architecture", link: "/advanced/architecture" },
					{ text: "Performance", link: "/performance" },
				],
			},
		],
		search: { provider: "local" },
		socialLinks: [
			{ icon: "github", link: "https://github.com/udodi-js/udodi" },
			{ icon: "x", link: "https://x.com/udodi_js" },
			{ icon: "linkedin", link: "https://www.linkedin.com/company/udodi" }
		],
	},
});
