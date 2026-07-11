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

	computed: {
		computeTest(ctx) {
			return ctx.count;
		},

		emailTouched(ctx) {
			const form = ctx.ud.forms.parallelForm;

			if (!form) {
				return false;
			}

			const field = form.getField("email");

			return field
				? field.touched
				: false;
		},

		emailDirty(ctx) {
			const form = ctx.ud.forms.parallelForm;

			if (!form) {
				return false;
			}

			const field = form.getField("email");

			return field
				? field.dirty
				: false;
		},

		emailValidating(ctx) {
			const form = ctx.ud.forms.parallelForm;

			if (!form) {
				return false;
			}

			const field = form.getField("email");

			return field
				? field.validating
				: false;
		},

		emailValue(ctx) {
			const form = ctx.ud.forms.parallelForm;

			if (!form) {
				return "";
			}

			return form.getValue("email");
		},
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

		email(value, validationContext) {
			console.log(validationContext);

			if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
				return true;
			}
			return "Invalid email format";
		},

		async slowEmail(value) {
			await new Promise((resolve) => setTimeout(resolve, 1500));

			if (value.endsWith("@example.com")) {
				return true;
			}

			return "Only @example.com emails are allowed";
		},

		async uniqueName(value) {
			await new Promise((resolve) => setTimeout(resolve, 1000));

			if (value.toLowerCase() !== "admin") {
				return true;
			}

			return "This name is already taken";
		},

		async handleParallelSubmit(submitContext) {
			console.log(
				"Parallel submit:",
				Object.fromEntries(
					submitContext.formData
				)
			);

			await new Promise((resolve) => setTimeout(resolve, 2000));

			console.log(
				"Finished submitting"
			);
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
		},

		removeFirstUser() {
			this.users = this.users.slice(1);
		},

		reverseUsers() {
			this.users.reverse();
		},

		shuffleUsers() {
			this.users.sort(() => Math.random() - 0.5);
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
			<div @text="computeTest" @ref="counter"></div>
			<button @on="click=increment:1">Click Me</button>

			<button @on="click=changeColor" @class="'btntext' getBgColor">
				Change Color
			</button>

			<div @class="classTest">
				Class Application
			</div>

			<div
				@style="styleTest"
				@attr="title='For testing.'|uppercase href=getLink:'googlee'"
			>
				Style Application
			</div>

			<hr>

			<h3>@show Tests</h3>

			<div @show="isVisible">
				Udodi.js is awesome!
			</div>

			<hr>

			<h3>@if Tests</h3>

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

			<h3>@validate Tests</h3>

			<form @form="validationForm">
				<label>
					User Name:
					<input
						name="username"
						type="text"
						@validate="between:2:100 validName"
						@trigger="live"
					>
				</label>

				<div
					@text="ud.forms.validationForm.errors.username"
					@style="'color:red;'"
				></div>

				<div>
					Valid:
					<span @text="ud.forms.validationForm.valid"></span>
				</div>
			</form>

			<hr>

			<h3>@form, @validate and @submit Tests</h3>

			<form @form="testForm" @submit="handleFormSubmit">
				<div>
					<label>
						Email (live validation):

						<input
							type="email"
							name="email"
							@validate="required email"
							@trigger="live submit"
							placeholder="Enter email"
						>
					</label>

					<div
						@text="ud.forms.testForm.errors.email"
						@style="'color:red;'"
					></div>
				</div>

				<div>
					<label>
						Name (lazy validation):

						<input
							type="text"
							name="name"
							@validate="required validName"
							@trigger="lazy"
							placeholder="Enter your name"
						>
					</label>

					<div
						@text="ud.forms.testForm.errors.name"
						@style="'color:red;'"
					></div>
				</div>

				<button type="submit">
					Submit Form
				</button>

				<div @style="'margin-top:10px; border:1px solid #ccc; padding:10px;'">
					<h4>Form State:</h4>

					<div>
						Valid:
						<strong @text="ud.forms.testForm.valid"></strong>
					</div>

					<div>
						Submitting:
						<strong @text="ud.forms.testForm.submitting"></strong>
					</div>

					<div>
						Submitted:
						<strong @text="ud.forms.testForm.submitted"></strong>
					</div>

					<div>
						Dirty:
						<strong @text="ud.forms.testForm.dirty"></strong>
					</div>

					<div>
						Touched:
						<strong @text="ud.forms.testForm.touched"></strong>
					</div>
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

			<hr>

			<h3>Sequential Validation Form</h3>

			<form @form="sequentialForm sequential" @submit="handleFormSubmit">
				<div>
					<input
						name="name"
						placeholder="Name"
						@validate="required validName"
						@trigger="submit"
					>

					<div @text="ud.forms.sequentialForm.errors.name" @style="'color:red;'"></div>
				</div>

				<div>
					<input
						name="email"
						placeholder="Email"
						@validate="required email"
						@trigger="submit"
					>

					<div @text="ud.forms.sequentialForm.errors.email" @style="'color:red;'"></div>
				</div>

				<button type="submit">
					Submit Sequential
				</button>

				<div>
					Valid:
					<span @text="ud.forms.sequentialForm.valid"></span>
				</div>

				<div>
					Validating:
					<span @text="ud.forms.sequentialForm.validating"></span>
				</div>

				<div>
					Submitting:
					<span @text="ud.forms.sequentialForm.submitting"></span>
				</div>

				<div>
					Submitted:
					<span @text="ud.forms.sequentialForm.submitted"></span>
				</div>

				<div>
					Name Error:
					<span @text="ud.forms.sequentialForm.errors.name"></span>
				</div>

				<div>
					Email Error:
					<span @text="ud.forms.sequentialForm.errors.email"></span>
				</div>
			</form>

			<hr>

			<h3>Parallel Validation Form</h3>

			<form @form="parallelForm parallel" @submit="handleParallelSubmit">
				<div>
					<input
						name="email"
						placeholder="Email"
						@validate="required email slowEmail"
						@trigger="submit"
					>

					<div @text="ud.forms.parallelForm.errors.email" @style="'color:red;'"></div>
				</div>

				<div>
					<input
						name="username"
						placeholder="Username"
						@validate="required uniqueName"
						@trigger="submit"
					>

					<div @text="ud.forms.parallelForm.errors.username" @style="'color:red;'"></div>
				</div>

				<button type="submit">
					Submit Parallel
				</button>

				<div>
					Valid:
					<span @text="ud.forms.parallelForm.valid"></span>
				</div>

				<div>
					Validating:
					<span @text="ud.forms.parallelForm.validating"></span>
				</div>

				<div>
					Submitting:
					<span @text="ud.forms.parallelForm.submitting"></span>
				</div>

				<div>
					Submitted:
					<span @text="ud.forms.parallelForm.submitted"></span>
				</div>

				<div>
					Validation Mode:
					<span @text="ud.forms.parallelForm.validationMode"></span>
				</div>

				<div>
					Email Error:
					<span @text="ud.forms.parallelForm.errors.email"></span>
				</div>

				<div>
					Username Error:
					<span @text="ud.forms.parallelForm.errors.username"></span>
				</div>
			</form>

			<div>
				Email Touched:
				<span @text="emailTouched"></span>
			</div>

			<div>
				Email Dirty:
				<span @text="emailDirty"></span>
			</div>

			<div>
				Email Validating:
				<span @text="emailValidating"></span>
			</div>

			<div>
				Email Value:
				<span @text="emailValue"></span>
			</div>
		</div>
	`,
});