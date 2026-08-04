import { createComponent, css, html } from "udodi";

/**
 * Forms: @form, @validate, @trigger, @submit (live / lazy / sequential / parallel).
 */
export const FormsDemo = createComponent({
	name: "FormsDemo",

	computed: {
		emailTouched(ctx) {
			const form = ctx.ud.forms.parallelForm;
			if (!form) return false;
			const field = form.getField("email");
			return field ? field.touched : false;
		},

		emailDirty(ctx) {
			const form = ctx.ud.forms.parallelForm;
			if (!form) return false;
			const field = form.getField("email");
			return field ? field.dirty : false;
		},

		emailValidating(ctx) {
			const form = ctx.ud.forms.parallelForm;
			if (!form) return false;
			const field = form.getField("email");
			return field ? field.validating : false;
		},

		emailValue(ctx) {
			const form = ctx.ud.forms.parallelForm;
			if (!form) return "";
			return form.getValue("email");
		},
	},

	methods: {
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

		handleFormSubmit(submitContext) {
			console.log("Form submitted!", submitContext);
			console.log(
				"Form data:",
				Object.fromEntries(submitContext.formData),
			);
			submitContext.controller.reset({ clearForm: true });
		},

		async handleParallelSubmit(submitContext) {
			console.log(
				"Parallel submit:",
				Object.fromEntries(submitContext.formData),
			);
			await new Promise((resolve) => setTimeout(resolve, 2000));
			console.log("Finished submitting");
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

		label {
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
			margin: 0.5rem 0;
			max-width: 360px;
		}

		input {
			padding: 0.4rem 0.5rem;
		}

		button {
			padding: 0.4rem 0.75rem;
			cursor: pointer;
			margin-top: 0.35rem;
		}

		.error {
			color: #b91c1c;
			font-size: 0.85rem;
		}

		.meta {
			margin-top: 0.75rem;
			padding: 0.75rem;
			border: 1px solid #e5e7eb;
			border-radius: 6px;
			font-size: 0.9rem;
		}

		.meta div {
			margin: 0.2rem 0;
		}
	`,

	template: () => html`
		<div>
			<h1>Forms</h1>
			<p>
				Validation triggers, sequential vs parallel modes, and submit handling.
			</p>

			<section>
				<h2>Live field validation</h2>
				<form @form="validationForm">
					<label>
						Username
						<input
							name="username"
							type="text"
							@validate="between:2:100 validName"
							@trigger="live"
						/>
					</label>
					<div
						class="error"
						@text="ud.forms.validationForm.errors.username"
					></div>
					<div class="meta">
						Valid:
						<span @text="ud.forms.validationForm.valid"></span>
					</div>
				</form>
			</section>

			<section>
				<h2>@form + @submit (live / lazy)</h2>
				<form @form="testForm" @submit="handleFormSubmit">
					<label>
						Email (live)
						<input
							type="email"
							name="email"
							@validate="required email"
							@trigger="live submit"
							placeholder="Enter email"
						/>
					</label>
					<div class="error" @text="ud.forms.testForm.errors.email"></div>

					<label>
						Name (lazy)
						<input
							type="text"
							name="name"
							@validate="required validName"
							@trigger="lazy"
							placeholder="Enter your name"
						/>
					</label>
					<div class="error" @text="ud.forms.testForm.errors.name"></div>

					<button type="submit">Submit form</button>

					<div class="meta">
						<div>Valid: <strong @text="ud.forms.testForm.valid"></strong></div>
						<div>
							Submitting:
							<strong @text="ud.forms.testForm.submitting"></strong>
						</div>
						<div>
							Submitted:
							<strong @text="ud.forms.testForm.submitted"></strong>
						</div>
						<div>Dirty: <strong @text="ud.forms.testForm.dirty"></strong></div>
						<div>
							Touched: <strong @text="ud.forms.testForm.touched"></strong>
						</div>
					</div>
				</form>
			</section>

			<section>
				<h2>Sequential validation</h2>
				<form
					@form="sequentialForm sequential"
					@submit="handleFormSubmit"
				>
					<label>
						Name
						<input
							name="name"
							placeholder="Name"
							@validate="required validName"
							@trigger="submit"
						/>
					</label>
					<div
						class="error"
						@text="ud.forms.sequentialForm.errors.name"
					></div>

					<label>
						Email
						<input
							name="email"
							placeholder="Email"
							@validate="required email"
							@trigger="submit"
						/>
					</label>
					<div
						class="error"
						@text="ud.forms.sequentialForm.errors.email"
					></div>

					<button type="submit">Submit sequential</button>

					<div class="meta">
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
					</div>
				</form>
			</section>

			<section>
				<h2>Parallel validation (async rules)</h2>
				<form
					@form="parallelForm parallel"
					@submit="handleParallelSubmit"
				>
					<label>
						Email (slow @example.com check)
						<input
							name="email"
							placeholder="Email"
							@validate="required email slowEmail"
							@trigger="submit"
						/>
					</label>
					<div
						class="error"
						@text="ud.forms.parallelForm.errors.email"
					></div>

					<label>
						Username (unique, not "admin")
						<input
							name="username"
							placeholder="Username"
							@validate="required uniqueName"
							@trigger="live submit"
						/>
					</label>
					<div
						class="error"
						@text="ud.forms.parallelForm.errors.username"
					></div>

					<button type="submit">Submit parallel</button>

					<div class="meta">
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
							Mode:
							<span @text="ud.forms.parallelForm.validationMode"></span>
						</div>
						<div>
							Email touched:
							<span @text="emailTouched"></span>
						</div>
						<div>
							Email dirty:
							<span @text="emailDirty"></span>
						</div>
						<div>
							Email validating:
							<span @text="emailValidating"></span>
						</div>
						<div>
							Email value:
							<span @text="emailValue"></span>
						</div>
					</div>
				</form>
			</section>
		</div>
	`,
});
