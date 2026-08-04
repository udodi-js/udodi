import { createComponent, css, html } from "udodi";

/**
 * Two-way binding: primitives and deep paths.
 */
export const BindDemo = createComponent({
	name: "BindDemo",

	state() {
		return {
			message: "Hello, World!",
			count: 0,
			toogle: true,
			user: {
				name: "John Doe",
			},
		};
	},

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

		label {
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
			margin: 0.5rem 0;
			max-width: 320px;
		}

		input[type="text"],
		input[type="number"] {
			padding: 0.4rem 0.5rem;
		}

		.preview {
			font-family: ui-monospace, monospace;
			font-size: 0.9rem;
			color: #374151;
		}
	`,

	template: () => html`
		<div>
			<h1>Bind</h1>
			<p>Two-way binding with @bind on text, number, checkbox, and nested paths.</p>

			<section>
				<h2>String</h2>
				<label>
					Message
					<input type="text" @bind="message" />
				</label>
				<div class="preview">Preview: <span @text="message"></span></div>
			</section>

			<section>
				<h2>Number</h2>
				<label>
					Count
					<input type="number" @bind="count" />
				</label>
				<div class="preview">Preview: <span @text="count"></span></div>
			</section>

			<section>
				<h2>Checkbox</h2>
				<label>
					<span>
						<input type="checkbox" @bind="toogle" />
						Toggle
					</span>
				</label>
				<div class="preview">Preview: <span @text="toogle"></span></div>
			</section>

			<section>
				<h2>Deep path</h2>
				<label>
					User name
					<input type="text" @bind="user.name" />
				</label>
				<div class="preview">Preview: <span @text="user.name"></span></div>
			</section>
		</div>
	`,
});
