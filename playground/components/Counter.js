import { html, createComponent, touch } from 'udodi';

export const Counter = createComponent({
	name: "counter",

	state: {
		count: 0,
		message: "Hello, World!",
		btnColor: "firstcolor",
		classTest: ['secondcolor'],
		styleTest: { background: 'yellow' },
		toogle: true,

		// Test deep @bind path
		user: {
			name: "John Doe",
		},

		// Test @for and @key
		users: [
			{
				id: 1,
				name: "John Doe",
				email: "john@example.com",
			},
			{
				id: 2,
				name: "Jane Smith",
				email: "jane@example.com",
			},
			{
				id: 3,
				name: "Attamah Celestine",
				email: "attamah@example.com",
			},
		],
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

		between(value, min, max) {
			if (value.length >= min && value.length <= max) {
				return true;
			}
			return "Value is not within the specified range";
		},

		validName(value) {
			if (/^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/.test(value)) {
				return true;
			}

			return "Invalid name format";
		},

		handleFormSubmit(submitContext) {
			console.log("Form submitted!", submitContext);
			console.log("Form data:", Object.fromEntries(submitContext.formData));

			// Reset the form after submission
			submitContext.controller.reset({ clearForm: true });
		},

		required(value) {
			if (value && value.trim().length > 0) {
				return true;
			}
			return "This field is required";
		},

		email(value) {
			if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
				return true;
			}
			return "Invalid email format";
		},

		// Handlers here

		increment(event, amount) {
			this.count = Number(this.count) + amount;
		},

		changeColor(event) {
			this.btnColor = "secondcolor";
			this.toogle = !this.toogle;
		},

		addUser() {
			this.users.push({
				id: Date.now(),
				name: "New User",
				email: "new@example.com",
			});

			touch(this, "users");
		},

		removeFirstUser() {
			this.users = this.users.slice(1);
		},

		reverseUsers() {
			this.users.reverse();
			touch(this, "users");
		},

		shuffleUsers() {
			this.users = [...this.users].sort(() => Math.random() - 0.5);
		},

		changeColor(event) {
			this.btnColor = "secondcolor";
			this.toogle = !this.toogle;
		},


	},

	onMount(root, ctx) {
		console.log(ctx.refs.counter);
	},

	onMount(root, ctx) {
		console.log(ctx.refs.counter);
	},

	template: () => html`
		<div>
			<div @text="message|uppercase"></div>
			<div @text="count" @ref="counter"></div>

			<button @on="click=increment:1">Click Me</button>
			<button @on="click=changeColor" @class="'btntext' getBgColor">
				Change Color
			</button>

			<div @class="classTest">Class Application</div>

			<div
				@style="styleTest"
				@attr="title='For testing.'|uppercase href=getLink:'googlee'"
			>
				Style Application
			</div>

			<hr>

			<h3>@show Tests</h3>

			<div @show="isVisible">Udodi.js is awesome!</div>

			<hr>

			<h3>@if Tests</h3>

			<div @if="isVisible">If test</div>
			<div @elseif="false">Else If test</div>
			<div @else>Else test</div>

			<hr>

			<h3>@bind Tests</h3>

			<label>
				Message:
				<input type="text" @bind="message">
			</label>

			<div @text="message"></div>

			<br>

			<label>
				Count:
				<input type="number" @bind="count">
			</label>

			<div @text="count"></div>

			<br>

			<label>
				Toggle:
				<input type="checkbox" @bind="toogle">
			</label>

			<div @text="toogle"></div>

			<br>

			<label>
				User Name:
				<input type="text" @bind="user.name">
			</label>

			<div @text="user.name"></div>

			<hr>

			<h3>@validate And @error Tests</h3>
			<label>
				User Name:
				<input @validate="between:2:100 validName" @error="message" type="text">
			</label>
			<div @text="ud.errors.message"></div>

			<hr>

			<h3>@form, @submit, and @trigger Tests</h3>

			<form @form="testForm" @submit="handleFormSubmit">
				<div>
					<label>
						Email (live validation):
						<input 
							type="email" 
							name="email"
							@validate="required email" 
							@error="email"
							@trigger="live submit"
							placeholder="Enter email"
						>
					</label>
					<div @text="ud.errors.email" @style="'color: red;'"></div>
				</div>

				<div>
					<label>
						Name (lazy validation):
						<input 
							type="text" 
							name="name"
							@validate="required validName" 
							@error="name"
							@trigger="lazy"
							placeholder="Enter your name"
						>
					</label>
					<div @text="ud.errors.name" @style="'color: red;'"></div>
				</div>

				<button type="submit">Submit Form</button>

				<div @style="'margin-top: 10px; border: 1px solid #ccc; padding: 10px;'">
					<h4>Form State:</h4>
					<div>Valid: <strong @text="ud.forms.testForm.valid"></strong></div>
					<div>Submitting: <strong @text="ud.forms.testForm.submitting"></strong></div>
					<div>Submitted: <strong @text="ud.forms.testForm.submitted"></strong></div>
					<div>Dirty: <strong @text="ud.forms.testForm.dirty"></strong></div>
					<div>Touched: <strong @text="ud.forms.testForm.touched"></strong></div>
				</div>
			</form>

			<hr>

			<h3>@for And @key Tests</h3>

			<div @style="'margin-bottom:10px;'">
				<button @on="click=addUser">
					Add User
				</button>

				<button @on="click=removeFirstUser">
					Remove First
				</button>

				<button @on="click=reverseUsers">
					Reverse
				</button>

				<button @on="click=shuffleUsers">
					Shuffle
				</button>
			</div>

			<ul>
				<li @for="user userIndex users" @key="user.id">
					<strong @text="userIndex"></strong>
					<span>. </span>

					<span @text="user.name"></span>

					<span> (</span>

					<span @text="user.email"></span>

					<span>)</span>
				</li>
			</ul>

			<hr>

			<h4>@for Without @key</h4>

			<ul>
				<li @for="user users">
					<span @text="user.name"></span>
				</li>
			</ul>
		</div>
	`,
});