import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Judge } from "@webappwiz/scry";
import { FakeJudge, ruleSource } from "@webappwiz/scry/testing";
import { color, MemoryLogger } from "webappwiz/log";
import { NodeFs, NodePs } from "webappwiz/system";
import { FakeProcess } from "webappwiz/system/testing";
import { FakeTimer, FakeWallClock } from "webappwiz/time/testing";
import { check } from "./check";
import type { Screen } from "./screen";

/**
 * The sandbox every `wiz scry` check test runs in: a git repo seeded once and
 * copied for each test, with fakes for the process, clock, timer and judge.
 * Call `seed` in `beforeAll`, `begin` in `beforeEach`, `end` in `afterEach`
 * and `dispose` in `afterAll`.
 */
export class Testing {
	readonly fs = new NodeFs();
	root = "";
	proc = new FakeProcess();
	ps = new NodePs({ proc: this.proc });
	log = new MemoryLogger();
	screen: Screen | undefined;
	timer = new FakeTimer();
	clock = new FakeWallClock(0);
	/** What the screen was given, and how much of the report was printed by then. */
	drawn: { text: string; printed: number }[] = [];
	judge: Judge = new FakeJudge(0.9);
	asked: string[] = [];
	readonly providers = {
		judge: async (model: string) => {
			this.asked.push(model);
			return this.judge;
		},
	};

	/** Asks the som about each comment. */
	readonly asking = `
		constructor(tools) { this.som = tools.som; }
		async check(file) {
			return Promise.all(
				file.ts.comments().map(async (comment) =>
					comment.flag("restates the code", await this.som.decide("Does it restate?", comment), "Does it restate?"),
				),
			);
		}
	`;

	/**
	 * Holds the repo every test starts from, made once and copied for each
	 * test: its six git spawns were most of what a test spent.
	 */
	private constructor(private readonly base: string) {}

	static async seed(): Promise<Testing> {
		const testing = new Testing(await mkdtemp(join(tmpdir(), "rules-check-")));
		await testing.fs.mkdir(`${testing.base}/home`);
		testing.enter(`${testing.base}/seed`);
		await testing.fs.mkdir(testing.root);
		await testing.budget('"unlimited"');
		await testing.git("init", "-q", "-b", "main");
		await testing.git("config", "user.email", "t@example.com");
		await testing.git("config", "user.name", "T");
		await testing.fs.write(`${testing.root}/a.ts`, "const a = 1;\n");
		await testing.git("add", "a.ts");
		await testing.install("no-foo", testing.flagging("foo"));
		await testing.fs.write(`${testing.root}/a.ts`, "const foo = 1;\n");
		return testing;
	}

	async dispose() {
		await rm(this.base, { recursive: true, force: true });
	}

	/** Starts a test in its own copy of the seeded repo. */
	async begin() {
		this.enter(await mkdtemp(`${this.base}/repo-`));
		await cp(`${this.base}/seed`, this.root, { recursive: true });
		this.log = new MemoryLogger();
		this.screen = undefined;
		this.timer = new FakeTimer();
		// noon on Wednesday 2026-10-14, local time
		this.clock = new FakeWallClock(new Date(2026, 9, 14, 12).getTime());
		this.drawn = [];
		this.judge = new FakeJudge(0.9);
		this.asked = [];
	}

	async end() {
		await rm(this.root, { recursive: true, force: true });
	}

	/** Points the sandbox at `dir`, a git repo that holds the user's config and state too. */
	private enter(dir: string) {
		this.root = dir;
		this.proc = new FakeProcess();
		// config and state in the sandbox so no real user config is read. HOME
		// stays the same for every test, since the `git` shim on macOS spends
		// some 80ms on its first call under each HOME it has not seen; the repo
		// does not, since a config at a path already imported is not read again
		this.proc.env = {
			PATH: process.env.PATH,
			HOME: `${this.base}/home`,
			XDG_CONFIG_HOME: `${this.root}/.config`,
			XDG_STATE_HOME: `${this.root}/.local/state`,
		};
		this.ps = new NodePs({ proc: this.proc });
		this.proc.chdir(this.root);
	}

	/** What `check` takes from the sandbox besides the paths and format. */
	get deps() {
		return {
			log: this.log,
			fs: this.fs,
			ps: this.ps,
			providers: this.providers,
		};
	}

	/** A screen that records what it is given, live or not. */
	recording(live: boolean): Screen {
		return {
			live,
			columns: 200,
			write: (text) => {
				this.drawn.push({
					text: color.strip(text),
					printed: this.log.entries.filter((entry) => entry.level === "info")
						.length,
				});
			},
		};
	}

	printed() {
		return color.strip(
			this.log.entries
				.filter((entry) => entry.level === "info")
				.map((entry) => String(entry.message))
				.join("\n"),
		);
	}

	warned() {
		return this.log.entries
			.filter((entry) => entry.level === "error")
			.map((entry) => String(entry.message));
	}

	async git(...args: string[]) {
		await this.ps.spawnCapture(["git", "-C", this.root, ...args]);
	}

	/** Installs and commits a rule whose class has `members`, the source of its methods. */
	async install(id: string, members: string) {
		await this.fs.mkdir(`${this.root}/.wiz/scry/${id}`);
		await this.fs.write(
			`${this.root}/.wiz/scry/${id}/rule.ts`,
			ruleSource(members, { description: `No ${id}.` }),
		);
		await this.git("add", ".wiz");
		await this.git("commit", "-qm", `add ${id}`);
	}

	/** Flags each line holding `word`, decided by code. */
	flagging(word: string) {
		return `
		async check(file) {
			return file.lines.flatMap((line, index) =>
				line.includes("${word}") ? [{ line: index + 1, message: "no ${word}", confidence: 1 }] : [],
			);
		}
	`;
	}

	run(format = "text", paths: string[] = ["a.ts"], profile?: string) {
		return check({
			paths,
			format,
			profile,
			...this.deps,
			screen: this.screen,
			timer: this.timer,
			clock: this.clock,
		});
	}

	/** Declares `budgets`, as source, in the user's config. */
	async budget(budgets: string) {
		await this.fs.mkdir(`${this.root}/.config/scry`, { recursive: true });
		await this.fs.write(
			`${this.root}/.config/scry/config.ts`,
			`export default { budgets: ${budgets} };\n`,
		);
	}

	/** What the ledger on this device holds for the project. */
	async ledger() {
		return JSON.parse(
			await this.fs.read(
				`${this.root}/.local/state/wiz/${this.root.split("/").pop()}/scry-spent.json`,
			),
		);
	}
}
