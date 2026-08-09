import { createComponent, createQueryPool, css, html } from "udodi";

/**
 * Shared pool for the playground demo.
 * Workers enabled so module queries/mutations exercise the real stack.
 */
const pool = createQueryPool({
	worker: {
		enabled: true,
		computeWorkers: 2,
	},
});

/** Register fixture modules (paths relative to this file). */
pool.registerModule("echo", {
	url: new URL("../modules/echo.query.js", import.meta.url).href,
});

pool.registerModule("stream", {
	url: new URL("../modules/stream.query.js", import.meta.url).href,
});

pool.registerModule("save", {
	url: new URL("../modules/save.mutation.js", import.meta.url).href,
});

/** Local upstream for dependsOn demos */
const authQuery = pool.query("auth", {
	source: async () => {
		await delay(80);
		return { userId: 1, role: "admin" };
	},
	cache: { ttl: 60_000 },
});

const usersQuery = pool.query("users", {
	source: async () => {
		await delay(100);
		return [
			{ id: 1, name: "Ada" },
			{ id: 2, name: "Grace" },
		];
	},
	dependsOn: ["auth"],
	cache: { ttl: 30_000 },
});

/** Worker module query */
const echoQuery = pool.query("echo", {
	module: "echo",
	dependsOn: ["users"],
});

/** Streaming worker query */
const streamQuery = pool.query("streamJob", {
	module: "stream",
	stream: true,
});

/** Worker mutation with invalidates */
const saveMutation = pool.mutation("saveUser", {
	module: "save",
	stream: true,
	invalidates: [
		"users",
		{ key: "echo", dependents: true },
	],
	async onMutate(input, ctx) {
		const previous = ctx.getQueryData("users");
		ctx.setQueryData("users", (users = []) =>
			users.map((u) =>
				u.id === input.id ? { ...u, name: input.name } : u,
			),
		);
		return { previous };
	},
	onError(_err, _input, ctx) {
		if (ctx.previous !== undefined) {
			ctx.setQueryData("users", ctx.previous);
		}
	},
});

/** Local mutation (no worker) */
const localSave = pool.mutation("localSave", {
	async execute(input, { signal }) {
		await delay(120, signal);
		return { saved: true, ...input };
	},
	invalidates: ["users"],
});

function delay(ms, signal) {
	return new Promise((resolve, reject) => {
		const t = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(t);
				reject(
					new DOMException(
						"Query execution was aborted.",
						"AbortError",
					),
				);
			},
			{ once: true },
		);
	});
}

function safeJson(value) {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

/**
 * Playground component to exercise Query Pool (local + worker modules).
 *
 * Import in playground/main.js:
 *
 *   import { QueryPoolDemo } from './components/QueryPoolDemo.js';
 *   render(QueryPoolDemo(), document.getElementById('root'));
 */
export const QueryPoolDemo = createComponent({
	name: "QueryPoolDemo",

	state() {
		return {
			log: "",
			renameTo: "Ada Lovelace",
			userId: 1,
			echoInput: "hello-worker",
			streamCount: 3,
			/** Snapshots mirrored from pool handles for @text bindings */
			authStatus: authQuery.status,
			usersStatus: usersQuery.status,
			usersData: safeJson(usersQuery.data),
			echoStatus: echoQuery.status,
			echoData: safeJson(echoQuery.data),
			streamStatus: streamQuery.status,
			streamChunks: safeJson(streamQuery.chunks),
			streamData: safeJson(streamQuery.data),
			saveStatus: saveMutation.status,
			saveData: safeJson(saveMutation.data),
			localSaveStatus: localSave.status,
		};
	},

	methods: {
		appendLog(line) {
			const stamp = new Date().toISOString().slice(11, 19);
			this.log = `[${stamp}] ${line}\n${this.log}`.slice(0, 4000);
		},

		syncFromPool() {
			this.authStatus = authQuery.status;
			this.usersStatus = usersQuery.status;
			this.usersData = safeJson(usersQuery.data);
			this.echoStatus = echoQuery.status;
			this.echoData = safeJson(echoQuery.data);
			this.streamStatus = streamQuery.status;
			this.streamChunks = safeJson(streamQuery.chunks);
			this.streamData = safeJson(streamQuery.data);
			this.saveStatus = saveMutation.status;
			this.saveData = safeJson(saveMutation.data);
			this.localSaveStatus = localSave.status;
		},

		async refreshDashboard() {
			this.appendLog("refresh dashboard graph (auth → users → echo)");
			try {
				await pool.refresh("echo", { force: true });
				this.appendLog("dashboard refresh ok");
			} catch (error) {
				this.appendLog(`dashboard error: ${error.message}`);
			}
			this.syncFromPool();
		},

		async refreshUsersDependents() {
			this.appendLog("refresh users with dependents: true");
			try {
				await pool.refresh("users", {
					force: true,
					dependents: true,
				});
				this.appendLog("users + dependents ok");
			} catch (error) {
				this.appendLog(`users dependents error: ${error.message}`);
			}
			this.syncFromPool();
		},

		async fetchEcho() {
			this.appendLog(`fetch echo module input=${this.echoInput}`);
			try {
				await echoQuery.fetch({
					input: { text: this.echoInput },
					dependencies: true,
				});
				this.appendLog("echo fetch ok");
			} catch (error) {
				this.appendLog(`echo error: ${error.message}`);
			}
			this.syncFromPool();
		},

		async runStream() {
			this.appendLog(`stream worker count=${this.streamCount}`);
			try {
				await streamQuery.fetch({
					input: { count: Number(this.streamCount) || 3 },
				});
				this.appendLog("stream finished");
			} catch (error) {
				this.appendLog(`stream error: ${error.message}`);
			}
			this.syncFromPool();
		},

		cancelStream() {
			this.appendLog("cancel stream");
			streamQuery.cancel();
			this.syncFromPool();
		},

		async runWorkerSave() {
			this.appendLog(
				`worker mutation save id=${this.userId} name=${this.renameTo}`,
			);
			try {
				await saveMutation.mutate({
					id: Number(this.userId) || 1,
					name: this.renameTo,
				});
				this.appendLog("worker mutation ok + invalidates");
			} catch (error) {
				this.appendLog(`worker mutation error: ${error.message}`);
			}
			this.syncFromPool();
		},

		async runLocalSave() {
			this.appendLog("local mutation save");
			try {
				await localSave.mutate({
					id: Number(this.userId) || 1,
					name: this.renameTo,
				});
				this.appendLog("local mutation ok");
			} catch (error) {
				this.appendLog(`local mutation error: ${error.message}`);
			}
			this.syncFromPool();
		},

		invalidateUsers() {
			usersQuery.invalidate();
			this.appendLog("users invalidated (stale; data kept)");
			this.syncFromPool();
		},

		resetUsers() {
			usersQuery.reset();
			this.appendLog("users reset");
			this.syncFromPool();
		},

		clearLog() {
			this.log = "";
		},
	},

	onMount(_root, ctx) {
		ctx.syncFromPool();
		ctx.appendLog("QueryPoolDemo mounted — pool workers enabled");
	},

	onUnmount() {
		pool.terminate();
	},

	style: css`
		:scope {
			font-family: system-ui, sans-serif;
			max-width: 920px;
			margin: 1rem auto;
			padding: 1rem;
			line-height: 1.4;
		}

		section {
			border: 1px solid #ddd;
			border-radius: 8px;
			padding: 0.75rem 1rem;
			margin-bottom: 1rem;
		}

		h2 {
			margin: 0 0 0.5rem;
			font-size: 1.1rem;
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

		input {
			padding: 0.35rem 0.5rem;
		}

		pre {
			background: #f6f8fa;
			padding: 0.5rem;
			border-radius: 4px;
			overflow: auto;
			font-size: 0.8rem;
			max-height: 160px;
		}

		.status {
			font-family: ui-monospace, monospace;
			font-size: 0.85rem;
		}

		.log {
			white-space: pre-wrap;
			max-height: 200px;
		}
	`,

	template: () => html`
		<div>
			<h1>Query Pool playground</h1>
			<p>
				Local queries, dependsOn graph, worker modules, streaming,
				and mutations (optimistic + invalidates).
			</p>

			<section>
				<h2>1. Graph refresh (auth → users → echo module)</h2>
				<div class="row">
					<button @on="click=refreshDashboard">
						Refresh echo (force graph)
					</button>
					<button @on="click=refreshUsersDependents">
						Refresh users + dependents
					</button>
					<button @on="click=invalidateUsers">Invalidate users</button>
					<button @on="click=resetUsers">Reset users</button>
				</div>
				<p class="status">
					auth: <span @text="authStatus"></span> · users:
					<span @text="usersStatus"></span> · echo:
					<span @text="echoStatus"></span>
				</p>
				<pre @text="usersData"></pre>
				<pre @text="echoData"></pre>
			</section>

			<section>
				<h2>2. Worker module fetch</h2>
				<div class="row">
					<label>
						input
						<input type="text" @bind="echoInput" />
					</label>
					<button @on="click=fetchEcho">
						fetch echo (dependencies: true)
					</button>
				</div>
			</section>

			<section>
				<h2>3. Streaming worker query</h2>
				<div class="row">
					<label>
						chunks
						<input type="number" @bind="streamCount" min="1" max="20" />
					</label>
					<button @on="click=runStream">Run stream</button>
					<button @on="click=cancelStream">Cancel</button>
				</div>
				<p class="status">
					status: <span @text="streamStatus"></span>
				</p>
				<pre @text="streamChunks"></pre>
				<pre @text="streamData"></pre>
			</section>

			<section>
				<h2>4. Mutations</h2>
				<div class="row">
					<label>
						id
						<input type="number" @bind="userId" />
					</label>
					<label>
						name
						<input type="text" @bind="renameTo" />
					</label>
					<button @on="click=runWorkerSave">
						Worker save + invalidates
					</button>
					<button @on="click=runLocalSave">Local save</button>
				</div>
				<p class="status">
					worker save: <span @text="saveStatus"></span> · local:
					<span @text="localSaveStatus"></span>
				</p>
				<pre @text="saveData"></pre>
			</section>

			<section>
				<h2>Log</h2>
				<div class="row">
					<button @on="click=clearLog">Clear</button>
				</div>
				<pre class="log" @text="log"></pre>
			</section>
		</div>
	`,
});
