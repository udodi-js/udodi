import { createComponent, css, html } from "udodi";
import { ParentScope } from "../ParentScope.js";

/**
 * Component-scoped CSS (@scope) demos via existing ParentScope/ChildScope.
 */
export const ScopeDemo = createComponent({
	name: "ScopeDemo",

	style: css`
		:scope {
			max-width: 920px;
			margin: 0 auto;
			padding: 1rem;
			font-family: system-ui, sans-serif;
			line-height: 1.45;
		}

		section {
			border: 1px solid #e5e7eb;
			border-radius: 8px;
			padding: 0.85rem 1rem;
			margin-bottom: 1rem;
			background: #fff;
		}

		h2 {
			margin: 0 0 0.6rem;
			font-size: 1.05rem;
		}
	`,

	template: () => html`
		<div>
			<h1>CSS scope</h1>
			<p>Component-scoped styles via ParentScope / ChildScope.</p>

			<section>
				<h2>Nested scoped components</h2>
				${ParentScope()}
			</section>
		</div>
	`,
});
