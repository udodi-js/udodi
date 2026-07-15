import { css, html, createComponent } from 'udodi';
import { ChildScope } from './ChildScope.js'

export const ParentScope = createComponent({
	name: "ParentScope",

	style: css`
        /* Inside a scoped stylesheet, use :scope to target 
		 * the component's root element. 
		 */
		:scope {
			background: red;
			color: black;
			padding: 10px;
			border: 3px solid green;
		}

		.text {
			color: lime;
			font-weight: bold;
		}
	`,

	template: () => html`
		<div>
			<div class="text">
				Parent Component
			</div>

			${ChildScope()}
		</div>
	`,
});