import { createComponent, css, html } from "udodi";

/**
 * Directives: @text, filters, computed, @on, @class, @style, @attr, @show, @if
 */
export const BasicsDemo = createComponent({
	name: "BasicsDemo",

	state() {
		return {
			count: 0,
			message: "Hello, World!",
			btnColor: "firstcolor",
			classTest: ["secondcolor"],
			styleTest: { background: "yellow" },
			toogle: true,
		};
	},

	computed: {
		computeTest(ctx) {
			return ctx.count;
		},
	},

	methods: {
		uppercase(data) {
			return String(data).toUpperCase();
		},

		getBgColor() {
			return this.btnColor;
		},

		getLink(key) {
			if (key === "google") {
				return "https://www.google.com";
			}
			return null;
		},

		isVisible() {
			return this.toogle;
		},

		increment(_event, amount) {
			this.count = Number(this.count) + amount;
		},

		changeColor() {
			this.btnColor =
				this.btnColor === "firstcolor" ? "secondcolor" : "firstcolor";
			this.toogle = !this.toogle;
		},
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

		.row {
			display: flex;
			flex-wrap: wrap;
			gap: 0.5rem;
			align-items: center;
			margin: 0.5rem 0;
		}

		button {
			padding: 0.4rem 0.75rem;
			cursor: pointer;
		}

		.firstcolor {
			background: #dbeafe;
		}

		.secondcolor {
			background: #fce7f3;
		}

		.btntext {
			font-weight: 600;
		}
	`,

	template: () => html`
		<div>
			<h1>Basics</h1>
			<p>Text, filters, computed values, events, class, style, attr, show, and if.</p>

			<section>
				<h2>Text, filter &amp; computed</h2>
				<div @text="message|uppercase"></div>
				<div class="row">
					<span>Computed count:</span>
					<strong @text="computeTest" @ref="counter"></strong>
				</div>
				<div class="row">
					<button type="button" @on="click=increment:1">Increment +1</button>
					<button type="button" @on="click=increment:5">Increment +5</button>
				</div>
			</section>

			<section>
				<h2>Class, style &amp; attr</h2>
				<div class="row">
					<button
						type="button"
						@on="click=changeColor"
						@class="'btntext' getBgColor"
					>
						Toggle color / visibility
					</button>
				</div>
				<div @class="classTest">Class application (@class)</div>
				<div
					@style="styleTest"
					@attr="title='For testing.'|uppercase href=getLink:'google'"
				>
					Style + attr application
				</div>
			</section>

			<section>
				<h2>@show</h2>
				<div @show="isVisible">Udodi.js is awesome! (visible when toggle is on)</div>
			</section>

			<section>
				<h2>@if / @elseif / @else</h2>
				<div @if="isVisible">If branch</div>
				<div @elseif="false">Else-if branch</div>
				<div @else>Else branch</div>
			</section>
		</div>
	`,
});
