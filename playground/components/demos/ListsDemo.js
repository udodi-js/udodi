import { createComponent, css, html } from "udodi";

/**
 * @for / @key list rendering and mutations.
 */
export const ListsDemo = createComponent({
	name: "ListsDemo",

	state() {
		return {
			users: [
				{ id: 1, name: "John Doe", email: "john@example.com" },
				{ id: 2, name: "Jane Smith", email: "jane@example.com" },
				{ id: 3, name: "Attamah Celestine", email: "attamah@example.com" },
			],
		};
	},

	methods: {
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
			margin-bottom: 0.75rem;
		}

		button {
			padding: 0.4rem 0.75rem;
			cursor: pointer;
		}

		ul {
			margin: 0;
			padding-left: 1.25rem;
		}

		li {
			margin: 0.25rem 0;
		}
	`,

	template: () => html`
		<div>
			<h1>Lists</h1>
			<p>Keyed and unkeyed list rendering with @for.</p>

			<section>
				<h2>@for with @key</h2>
				<div class="row">
					<button type="button" @on="click=addUser">Add user</button>
					<button type="button" @on="click=removeFirstUser">Remove first</button>
					<button type="button" @on="click=reverseUsers">Reverse</button>
					<button type="button" @on="click=shuffleUsers">Shuffle</button>
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
			</section>

			<section>
				<h2>@for without @key</h2>
				<ul>
					<li @for="user users">
						<span @text="user.name"></span>
					</li>
				</ul>
			</section>
		</div>
	`,
});
