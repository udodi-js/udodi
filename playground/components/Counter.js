import { html, createComponent } from 'udodi';

export const Counter = createComponent({
	name: "counter",

	state: {
		count: 0,
		message: "Hello, World!",
		btnColor: "firstcolor",
		classTest: ['secondcolor'],
		styleTest: { background: 'yellow' },
		toogle: true,
	},

	methods: {
		uppercase(data) {
			return data.toUpperCase();
		},

		getBgColor() {
			return this.btnColor;
		},

		getLink(key) {
			if (key === 'google') {
				return 'https://www.google.com';
			}

			return null;
		},

		isVisible() {
			return this.toogle;
		},
	},

	handlers: {
		increment(event, amount) {
			this.count = this.count + amount;
		},

		changeColor(event) {
			this.btnColor = "secondcolor";
			this.toogle = !this.toogle;
		},


	},

	onMount(root, ctx) {
		console.log(ctx.refs.counter);
	},

	template: () => html`
		<div>
			<div @text="message|uppercase"></div>
			<div @text="count" @ref="counter"></div>

			<button @on="click=increment:1">Click Me</button>
			<button @on="click=changeColor" @class="'btntext' getBgColor">Change Color</button>

			<div @class="classTest">Class Application</div>
			<div @style="styleTest" @attr="title='For testing.'|uppercase href=getLink:'googlee'">
				Style Application
			</div>

			<div @show="isVisible">Udodi.js is awesome!</div>

			<div @if="isVisible">If test</div>
			<div @elseif="false">Else If test</div>
			<div @else>Else test</div>
		</div>
	`,
});