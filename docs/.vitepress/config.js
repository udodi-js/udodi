import { defineConfig } from "vitepress";

export default defineConfig({
	title: "Udodi",
	description: "Udodi is a lightweight, zero-dependency reactive JavaScript UI framework with fine-grained reactivity, a declarative HTML DSL, and a component-first architecture.",
	ignoreDeadLinks: true, // Still writing the docs, so some links may be dead for now. This will be removed once the docs are complete.
	vite: {
        build: {
            chunkSizeWarningLimit: 1500,
        },
    },
	base: "/",
	head: [
		// Favicon
		[
			"link",
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
		],

		// Basic SEO
		[
			"meta",
			{
				name: "description",
				content: "Udodi is a lightweight, zero-dependency reactive JavaScript UI framework with fine-grained reactivity, a declarative HTML DSL, and a component-first architecture. No Virtual DOM, no JSX, CSP-friendly.",
			},
		],
		[
			"meta",
			{
				name: "keywords",
				content: "udodi, javascript, reactive, framework, ui, fine-grained reactivity, declarative dsl, no virtual dom, components, store, query pool, form system, overlay, zero dependencies, csp-friendly",
			},
		],
		["meta", { name: "author", content: "Udodi" }],
		["meta", { name: "robots", content: "index, follow" }],

		// Open Graph
		["meta", { property: "og:type", content: "website" }],
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
			{ property: "og:url", content: "https://udodi.dev" },
		],
		["meta", { property: "og:site_name", content: "Udodi" }],
		[
			"meta",
			{
				property: "og:image",
				content: "https://raw.githubusercontent.com/udodi-js/udodi/main/assets/udodi-github-banner.png",
			},
		],
		[
			"meta",
			{
				property: "og:image:alt",
				content: "Udodi - Lightweight Reactive JavaScript Framework",
			},
		],
		["meta", { property: "og:locale", content: "en_US" }],

		// Twitter Card
		["meta", { name: "twitter:card", content: "summary_large_image" }],
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
				content: "https://raw.githubusercontent.com/udodi-js/udodi/main/assets/udodi-github-banner.png",
			},
		],
		[
			"meta",
			{
				name: "twitter:image:alt",
				content: "Udodi - Lightweight Reactive JavaScript Framework",
			},
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
				text: "Performance",
				items: [{ text: "Performance", link: "/performance" }],
			},
		],
		search: { provider: "local" },
		socialLinks: [
			{ icon: "github", link: "https://github.com/udodi-js/udodi" },
			{ icon: "x", link: "https://x.com/udodi_js" },
		],
	},
});
