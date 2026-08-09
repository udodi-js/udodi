import { createComponent, css, html } from "udodi";
import { BasicsDemo } from "./demos/BasicsDemo.js";
import { BindDemo } from "./demos/BindDemo.js";
import { ListsDemo } from "./demos/ListsDemo.js";
import { FormsDemo } from "./demos/FormsDemo.js";
import { ScopeDemo } from "./demos/ScopeDemo.js";
import { QueryPoolDemo } from "./demos/QueryPoolDemo.js";

/**
 * Playground shell — sticky header, tabs top-right, one active demo.
 */
export const App = createComponent({
	name: "PlaygroundApp",

	state() {
		return {
			/** @type {string} */
			activeTab: "basics",
		};
	},

	methods: {
		setTab(_event, id) {
			this.activeTab = id;
		},

		isBasics() {
			return this.activeTab === "basics";
		},

		isBind() {
			return this.activeTab === "bind";
		},

		isLists() {
			return this.activeTab === "lists";
		},

		isForms() {
			return this.activeTab === "forms";
		},

		isScope() {
			return this.activeTab === "scope";
		},

		isQueryPool() {
			return this.activeTab === "query-pool";
		},

		tabClass(id) {
			return this.activeTab === id ? "tab tab-active" : "tab";
		},

		basicsTabClass() {
			return this.tabClass("basics");
		},

		bindTabClass() {
			return this.tabClass("bind");
		},

		listsTabClass() {
			return this.tabClass("lists");
		},

		formsTabClass() {
			return this.tabClass("forms");
		},

		scopeTabClass() {
			return this.tabClass("scope");
		},

		queryPoolTabClass() {
			return this.tabClass("query-pool");
		},
	},

	style: css`
		:scope {
			min-height: 100vh;
			font-family: system-ui, -apple-system, Segoe UI, sans-serif;
			color: #111;
			background: #f3f4f6;
		}

		.playground-header {
			position: sticky;
			top: 0;
			z-index: 20;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;
			padding: 0.65rem 1rem;
			background: #fff;
			border-bottom: 1px solid #e5e7eb;
			box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
		}

		.playground-title {
			font-size: 0.95rem;
			font-weight: 600;
			white-space: nowrap;
		}

		.playground-title span {
			font-weight: 400;
			color: #6b7280;
		}

		.tabs {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			justify-content: flex-end;
			gap: 0.35rem;
			margin-left: auto;
		}

		.tab {
			appearance: none;
			border: 1px solid #d1d5db;
			background: #fff;
			color: #374151;
			border-radius: 999px;
			padding: 0.35rem 0.8rem;
			font-size: 0.8rem;
			cursor: pointer;
			line-height: 1.2;
		}

		.tab:hover {
			border-color: #9ca3af;
			background: #f9fafb;
		}

		.tab-active {
			border-color: #111827;
			background: #111827;
			color: #fff;
		}

		.tab-active:hover {
			border-color: #111827;
			background: #111827;
			color: #fff;
		}

		.playground-body {
			padding: 0.5rem 0 2rem;
		}
	`,

	template: () => html`
		<div>
			<header class="playground-header">
				<div class="playground-title">
					Udodi <span>playground</span>
				</div>

				<nav class="tabs" aria-label="Playground demos">
					<button
						type="button"
						@class="basicsTabClass"
						@on="click=setTab:'basics'"
					>
						Basics
					</button>
					<button
						type="button"
						@class="bindTabClass"
						@on="click=setTab:'bind'"
					>
						Bind
					</button>
					<button
						type="button"
						@class="listsTabClass"
						@on="click=setTab:'lists'"
					>
						Lists
					</button>
					<button
						type="button"
						@class="formsTabClass"
						@on="click=setTab:'forms'"
					>
						Forms
					</button>
					<button
						type="button"
						@class="scopeTabClass"
						@on="click=setTab:'scope'"
					>
						CSS scope
					</button>
					<button
						type="button"
						@class="queryPoolTabClass"
						@on="click=setTab:'query-pool'"
					>
						Query Pool
					</button>
				</nav>
			</header>

			<main class="playground-body">
				<div @if="isBasics">${BasicsDemo()}</div>
				<div @if="isBind">${BindDemo()}</div>
				<div @if="isLists">${ListsDemo()}</div>
				<div @if="isForms">${FormsDemo()}</div>
				<div @if="isScope">${ScopeDemo()}</div>
				<div @if="isQueryPool">${QueryPoolDemo()}</div>
			</main>
		</div>
	`,
});
