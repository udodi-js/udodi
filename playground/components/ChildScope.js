import { css, html, createComponent } from 'udodi';

export const ChildScope = createComponent({
	name: "ChildScope",

	style: css`
	    /* Inside a scoped stylesheet, use :scope to target 
		 * the component's root element. 
		 */
		:scope {
			background: blue;
			color: white;
			padding: 10px;
			border: 3px solid black;
		}

		.text {
			color: yellow;
			font-weight: bold;
		}
	`,

	template: () => html`
		<div>
			<div class="text">
				Child Component
			</div>
		</div>
	`,
});