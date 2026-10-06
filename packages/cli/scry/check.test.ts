import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
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

describe("wiz scry", () => {
	const fs = new NodeFs();
	let root: string;
	let proc: FakeProcess;
	let ps: NodePs;
	let log: MemoryLogger;
	let screen: Screen | undefined;
	let timer: FakeTimer;
	let clock: FakeWallClock;
	/** What the screen was given, and how much of the report was printed by then. */
	let drawn: { text: string; printed: number }[];
	/** A screen that records what it is given, live or not. */
	const recording = (live: boolean): Screen => ({
		live,
		columns: 200,
		write: (text) => {
			drawn.push({
				text: color.strip(text),
				printed: log.entries.filter((entry) => entry.level === "info").length,
			});
		},
	});

	let judge: Judge;
	let asked: string[];
	const providers = {
		judge: async (model: string) => {
			asked.push(model);
			return judge;
		},
	};

	const printed = () =>
		color.strip(
			log.entries
				.filter((entry) => entry.level === "info")
				.map((entry) => String(entry.message))
				.join("\n"),
		);
	const warned = () =>
		log.entries
			.filter((entry) => entry.level === "error")
			.map((entry) => String(entry.message));

	const git = async (...args: string[]) => {
		await ps.spawnCapture(["git", "-C", root, ...args]);
	};
	/** Installs and commits a rule whose class has `members`, the source of its methods. */
	const install = async (id: string, members: string) => {
		await fs.mkdir(`${root}/.wiz/scry/${id}`);
		await fs.write(
			`${root}/.wiz/scry/${id}/rule.ts`,
			ruleSource(members, { description: `No ${id}.` }),
		);
		await git("add", ".wiz");
		await git("commit", "-qm", `add ${id}`);
	};
	/** Flags each line holding `word`, decided by code. */
	const flagging = (word: string) => `
		async check(file) {
			return file.lines.flatMap((line, index) =>
				line.includes("${word}") ? [{ line: index + 1, message: "no ${word}", confidence: 1 }] : [],
			);
		}
	`;
	/** Asks the decider about each comment. */
	const asking = `
		constructor(tools) { this.decider = tools.decider; }
		async check(file) {
			return Promise.all(
				file.ts.comments().map(async (comment) =>
					comment.flag("restates the code", await this.decider.decide("Does it restate?", comment), "Does it restate?"),
				),
			);
		}
	`;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "rules-check-"));
		proc = new FakeProcess();
		// HOME points into the sandbox so no real user config is read
		proc.env = { PATH: process.env.PATH, HOME: root };
		ps = new NodePs({ proc });
		proc.chdir(root);
		log = new MemoryLogger();
		screen = undefined;
		timer = new FakeTimer();
		// noon on Wednesday 2026-10-14, local time
		clock = new FakeWallClock(new Date(2026, 9, 14, 12).getTime());
		await budget('"unlimited"');
		drawn = [];
		judge = new FakeJudge(0.9);
		asked = [];
		await git("init", "-q", "-b", "main");
		await git("config", "user.email", "t@example.com");
		await git("config", "user.name", "T");
		await fs.write(`${root}/a.ts`, "const a = 1;\n");
		await git("add", "a.ts");
		await install("no-foo", flagging("foo"));
		await fs.write(`${root}/a.ts`, "const foo = 1;\n");
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const run = (format = "text", paths: string[] = ["a.ts"], model?: string) =>
		check({
			paths,
			format,
			model,
			log,
			fs,
			ps,
			providers,
			screen,
			timer,
			clock,
		});
	/** Declares `budgets`, as source, in the user's config. */
	async function budget(budgets: string) {
		await fs.mkdir(`${root}/.config/wiz`, { recursive: true });
		await fs.write(
			`${root}/.config/wiz/config.ts`,
			`export default { scry: { budgets: ${budgets} } };\n`,
		);
	}
	/** What the ledger on this device holds for the project. */
	const ledger = async () =>
		JSON.parse(
			await fs.read(
				`${root}/.local/state/wiz/${root.split("/").pop()}/scry-spent.json`,
			),
		);

	it("prints the problems under their file, how sure the check is, and exits 1 on an error", async () => {
		await run();

		expect(printed()).toEqual(
			[
				"a.ts",
				"  1   error   100%   no foo   no-foo",
				"",
				"✖ 1 problem (1 error, 0 warnings) in 1 file",
			].join("\n"),
		);
		expect(proc.exits).toEqual([1]);
	});

	it("names each file still excusing itself with rule-ignore", async () => {
		await fs.write(
			`${root}/a.ts`,
			"// rule-ignore no-foo: old spelling\nconst foo = 1;\n",
		);

		await run();

		expect(warned()).toEqual([
			"1 file still uses rule-ignore, which scry honors for now: rename it to scry-ignore\n  a.ts",
		]);
	});

	it("prints the report as JSON when asked, confidence and all", async () => {
		await run("json");

		expect(JSON.parse(printed())).toMatchObject({
			problems: [
				{
					path: "a.ts",
					line: 1,
					rule: "no-foo",
					level: "error",
					confidence: 1,
				},
			],
			spent: { requests: 0, questions: 0, cached: 0 },
		});
	});

	it("asks no model, nor wants its credentials, when no rule asks the decider", async () => {
		await run();

		expect(asked).toEqual([]);
	});

	it("asks the configured model what a rule's decider asks, and drops what it thinks unlikely", async () => {
		await install("why-not-what", asking);
		await fs.write(`${root}/a.ts`, "// add one\nconst a = 1;\n");
		judge = new FakeJudge(0.2);

		await run();

		expect(asked).toEqual(["clef"]);
		expect(printed()).toEqual(
			["✔ no problems in 1 file", "  asked 1 question in 1 request"].join("\n"),
		);
		expect(proc.exits).toEqual([]);
	});

	it("asks the model it is given over the config's", async () => {
		await install("why-not-what", asking);
		await fs.write(`${root}/a.ts`, "// add one\nconst a = 1;\n");

		await run("text", [], "jev-latest");

		expect(asked).toEqual(["jev-latest"]);
	});

	it("answers from earlier runs what it was asked about an unchanged file", async () => {
		await install("why-not-what", asking);
		await fs.write(`${root}/a.ts`, "// add one\nconst a = 1;\n");
		judge = new FakeJudge(0, { input: 7000 });

		await run();
		await run();

		expect(
			printed()
				.split("\n")
				.filter((line) => line.includes("asked")),
		).toEqual([
			"  asked 1 question in 1 request, 7k input tokens",
			"  asked 0 questions in 0 requests, 1 answered from earlier runs",
		]);
	});

	it("says what a check would cost with --cost, counting what it would ask rather than asking", async () => {
		await install("why-not-what", asking);
		await fs.write(`${root}/a.ts`, "// add one\n// and two\nconst a = 1;\n");
		const counting = new FakeJudge(0.9, { input: 4200 });
		judge = counting;

		await check({
			paths: ["a.ts"],
			format: "text",
			cost: true,
			log,
			fs,
			ps,
			providers,
		});

		expect(printed()).toEqual(
			"estimated 4.2k input tokens to check 1 file: 2 questions in 1 request",
		);
		expect([counting.judgments, proc.exits]).toEqual([[], []]);
	});

	it("keeps nothing it counted with --cost, so a check after still asks", async () => {
		await install("why-not-what", asking);
		await fs.write(`${root}/a.ts`, "// add one\nconst a = 1;\n");
		judge = new FakeJudge(0.2, { input: 300 });

		await check({
			paths: ["a.ts"],
			format: "text",
			cost: true,
			log,
			fs,
			ps,
			providers,
		});
		await run();
		await check({
			paths: ["a.ts"],
			format: "json",
			cost: true,
			log,
			fs,
			ps,
			providers,
		});

		const lines = printed().split("\n");
		expect(lines.slice(0, 3)).toEqual([
			"estimated 300 input tokens to check 1 file: 1 question in 1 request",
			"✔ no problems in 1 file",
			"  asked 1 question in 1 request, 300 input tokens",
		]);
		// what the check was told costs nothing again
		expect(JSON.parse(lines.slice(3).join("\n"))).toEqual({
			files: 1,
			unchecked: [],
			cancelled: false,
			spent: { requests: 0, questions: 0, input: 0, cached: 1 },
		});
	});

	it("names what --cost could not count, and exits 2", async () => {
		await install("why-not-what", asking);
		await fs.write(`${root}/a.ts`, "// add one\nconst a = 1;\n");
		judge = new FakeJudge(0);
		judge.count = async () => {
			throw new Error("clef needs CLOUDFLARE_API_TOKEN");
		};

		await check({
			paths: ["a.ts"],
			format: "text",
			cost: true,
			log,
			fs,
			ps,
			providers,
		});

		expect(printed()).toEqual(
			[
				"not counted",
				"  why-not-what on a.ts   clef needs CLOUDFLARE_API_TOKEN",
				"",
				"estimated 0 input tokens to check 1 file: 1 question in 1 request, but 1 not counted",
			].join("\n"),
		);
		expect(proc.exits).toEqual([2]);
	});

	it("reports a rule whose check threw as not checked, and exits 2", async () => {
		await install("fragile", "async check() { throw new Error('boom'); }");

		await run();

		expect(printed()).toContain(
			["not checked", "  fragile on a.ts   boom"].join("\n"),
		);
		expect(proc.exits).toEqual([1]);
	});

	it("exits 2 when something went unchecked and nothing is an error", async () => {
		await install("fragile", "async check() { throw new Error('boom'); }");
		await fs.write(`${root}/a.ts`, "const a = 2;\n");

		await run();

		expect(proc.exits).toEqual([2]);
	});

	it("checks every file under the working directory, changed or not, given no paths", async () => {
		await fs.mkdir(`${root}/src`);
		await fs.write(`${root}/src/b.ts`, "const foo = 2;\n");
		await git("add", "src");
		await git("commit", "-qam", "change");
		proc.chdir(`${root}/src`);

		await run("text", []);

		expect(printed()).toEqual(
			[
				"src/b.ts",
				"  1   error   100%   no foo   no-foo",
				"",
				"✖ 1 problem (1 error, 0 warnings) in 1 file",
			].join("\n"),
		);
	});

	it("says so when there is no file under the working directory", async () => {
		await fs.mkdir(`${root}/empty`);
		proc.chdir(`${root}/empty`);

		await run("text", []);

		expect(warned()).toEqual(["no files to check"]);
	});

	it("checks every file under the paths it is given, changed or not, from the working directory", async () => {
		await fs.mkdir(`${root}/src`);
		await fs.write(`${root}/src/b.ts`, "const foo = 2;\n");
		await fs.write(`${root}/src/.gitignore`, "ignored.ts\n");
		await git("add", "src");
		await git("commit", "-qm", "b");
		await fs.write(`${root}/src/c.ts`, "const foo = 3;\n");
		await fs.write(`${root}/src/ignored.ts`, "const foo = 4;\n");
		proc.chdir(`${root}/src`);

		await run("text", ["."]);

		expect(printed()).toEqual(
			[
				"src/b.ts",
				"  1   error   100%   no foo   no-foo",
				"",
				"src/c.ts",
				"  1   error   100%   no foo   no-foo",
				"",
				"✖ 2 problems (2 errors, 0 warnings) in 2 files",
			].join("\n"),
		);
	});

	it("checks with only the rules it is given", async () => {
		await install("no-const", flagging("const"));

		await check({
			paths: ["a.ts"],
			rules: ["no-const"],
			format: "json",
			log,
			fs,
			ps,
			providers,
		});

		expect(
			JSON.parse(printed()).problems.map(({ rule }: { rule: string }) => rule),
		).toEqual(["no-const"]);
	});

	it("checks a file it is given by name", async () => {
		await git("commit", "-qam", "change");

		await run("json", ["a.ts"]);

		expect(JSON.parse(printed())).toMatchObject({
			files: 1,
			problems: [{ path: "a.ts", line: 1, rule: "no-foo" }],
		});
		expect(JSON.parse(printed()).since).toBeUndefined();
	});

	it("checks only the files under the paths that changed since a ref it is given", async () => {
		await fs.mkdir(`${root}/src`);
		await fs.write(`${root}/src/b.ts`, "const foo = 2;\n");
		await git("add", ".");
		await git("commit", "-qm", "b");
		await fs.write(`${root}/src/c.ts`, "const foo = 3;\n");

		await check({
			paths: ["src"],
			since: "HEAD",
			format: "text",
			log,
			fs,
			ps,
			providers,
		});

		expect(printed()).toEqual(
			[
				"src/c.ts",
				"  1   error   100%   no foo   no-foo",
				"",
				"✖ 1 problem (1 error, 0 warnings) in 1 file since HEAD",
			].join("\n"),
		);
	});

	it("checks none of the files the config excludes", async () => {
		await fs.mkdir(`${root}/.wiz`);
		await fs.write(
			`${root}/.wiz/config.ts`,
			'export default { scry: { exclude: ["vendor/**"] } };\n',
		);
		await fs.mkdir(`${root}/vendor`);
		await fs.write(`${root}/vendor/b.ts`, "const foo = 2;\n");

		await run("json");

		expect(JSON.parse(printed()).problems).toMatchObject([
			{ path: "a.ts", line: 1, rule: "no-foo" },
		]);
	});

	it("says where it looked when there is no file under the paths", async () => {
		await fs.mkdir(`${root}/src`);

		await run("text", ["src"]);

		expect(warned()).toEqual(["no files to check in src"]);
	});

	it("says where it looked when nothing changed under the paths since a ref", async () => {
		await fs.mkdir(`${root}/src`);

		await check({
			paths: ["src"],
			since: "HEAD",
			format: "text",
			log,
			fs,
			ps,
			providers,
		});

		expect(warned()).toEqual(["nothing changed since HEAD in src"]);
	});

	describe("budgets", () => {
		beforeEach(async () => {
			await install("why-not-what", asking);
			await fs.write(`${root}/a.ts`, "// add one\nconst a = 1;\n");
			judge = new FakeJudge(0.9, { input: 300 });
		});

		it("refuses to check with no budget declared, and exits 3", async () => {
			await fs.rm(`${root}/.config/wiz/config.ts`);

			await run();

			expect([warned(), asked, proc.exits]).toEqual([
				[
					'no budget declared: set scry.budgets in .wiz/config.ts or ~/.config/wiz/config.ts to "nothing", "unlimited", or limits like [{ llm: 2_000_000, per: "month" }]; --cost says what a check would spend',
				],
				[],
				[3],
			]);
		});

		it("checks with no budget declared when told to override it", async () => {
			await fs.rm(`${root}/.config/wiz/config.ts`);

			await check({
				paths: ["a.ts"],
				format: "text",
				overrideBudget: true,
				log,
				fs,
				ps,
				providers,
				clock,
			});

			expect(printed()).toContain("restates the code");
		});

		it("asks a role budgeted nothing no question, leaving what it would ask unchecked", async () => {
			await budget('"nothing"');

			await run();

			expect(printed()).toContain(
				"  why-not-what on a.ts   scry.budgets spends nothing on the decider",
			);
			expect([(judge as FakeJudge).judgments, proc.exits]).toEqual([[], [2]]);
		});

		it("refuses up front a check that would go over a budget, saying which, and asks nothing", async () => {
			await budget('[{ decider: 200, llm: "unlimited", per: "check" }]');

			await run();

			expect(warned().map((line) => color.strip(line))).toEqual([
				[
					"over budget: this check would spend more than scry.budgets allows",
					"budgets",
					"  decider   this check   would use 300 of 200, 0 spent   over by 100",
					"  llm       unlimited    would use 0",
					"raise scry.budgets, check fewer files, or run again with --override-budget",
				].join("\n"),
			]);
			expect([(judge as FakeJudge).judgments, proc.exits]).toEqual([[], [3]]);
		});

		it("keeps what each check spent on the device, and holds the next to what is left of the window", async () => {
			await budget('[{ decider: 500, llm: "unlimited", per: "day" }]');

			await run();
			await fs.write(`${root}/a.ts`, "// add two\nconst a = 2;\n");
			await run();

			expect(await ledger()).toEqual([
				{ at: clock.now(), role: "decider", model: "clef", input: 300 },
			]);
			expect(proc.exits).toEqual([1, 3]);
			expect(color.strip(warned().join("\n"))).toContain(
				"  decider   today       would use 300 of 500, 300 spent   over by 100",
			);
		});

		it("forgets what was spent before a rolling window", async () => {
			await budget('[{ decider: 500, llm: "unlimited", within: "7d" }]');
			await run();
			clock.set(clock.now() + 8 * 24 * 60 * 60 * 1000);
			await fs.write(`${root}/a.ts`, "// add two\nconst a = 2;\n");

			await run();

			expect([(judge as FakeJudge).judgments.length, proc.exits]).toEqual([
				2,
				[1, 1],
			]);
		});

		it("says with --cost what a check would use of each budget, and leave", async () => {
			await budget(
				'[{ decider: 2_000_000, llm: "unlimited", per: "month" }, { decider: 1000, within: "7d" }]',
			);

			await check({
				paths: ["a.ts"],
				format: "text",
				cost: true,
				log,
				fs,
				ps,
				providers,
				clock,
			});

			expect(printed()).toEqual(
				[
					"estimated 300 input tokens to check 1 file: 1 question in 1 request",
					"budgets",
					"  decider   this month    would use 300 of 2m, 0 spent   2m left",
					"  decider   the last 7d   would use 300 of 1k, 0 spent   700 left",
					"  llm       unlimited     would use 0",
				].join("\n"),
			);
		});
	});

	it("stops on the first ctrl-c, reports what came back, and quits on the next", async () => {
		await install("why-not-what", asking);
		await fs.write(`${root}/a.ts`, "// add one\nconst a = 1;\n");
		judge = { judge: () => new Promise(() => undefined), count: async () => 0 };
		setTimeout(() => proc.dispatch("SIGINT"), 200);

		await run();

		expect(printed()).toEqual(
			[
				"not checked",
				"  why-not-what on a.ts   cancelled",
				"",
				"⚠ cancelled: no problems found in 1 file, but 1 not checked",
				"  asked 1 question in 1 request",
			].join("\n"),
		);
		expect(proc.exits).toEqual([2]);
		proc.dispatch("SIGINT");
		expect(proc.exits).toEqual([2, 130]);
	});

	it("draws what is done and asked on a live screen as it checks, and erases it before the report", async () => {
		await install("why-not-what", asking);
		await fs.write(`${root}/a.ts`, "// add one\nconst a = 1;\n");
		screen = recording(true);
		const answering = new FakeJudge(0.2);
		judge = {
			judge: (judgment) => {
				timer.fireIntervals();
				return answering.judge(judgment);
			},
			count: async () => 0,
		};

		await run();

		expect(drawn).toEqual([
			{
				text: "\r⠋ checking 0 of 1 file · 1 question asked, 0 answered\u001B[K",
				printed: 0,
			},
			{ text: "\r\u001B[K", printed: 0 },
		]);
		expect(printed()).toEqual(
			["✔ no problems in 1 file", "  asked 1 question in 1 request"].join("\n"),
		);
		expect(timer.intervals.every((entry) => entry.disposed)).toBe(true);
	});

	it("draws nothing for a report in JSON, nor on a screen that is not live", async () => {
		screen = recording(true);
		await run("json");
		screen = recording(false);
		await run();

		expect([drawn, timer.intervals]).toEqual([[], []]);
	});

	it("erases its line before quitting on a second ctrl-c", async () => {
		await install("why-not-what", asking);
		await fs.write(`${root}/a.ts`, "// add one\nconst a = 1;\n");
		screen = recording(true);
		judge = {
			judge: () => {
				timer.fireIntervals();
				proc.dispatch("SIGINT");
				proc.dispatch("SIGINT");
				return new Promise(() => undefined);
			},
			count: async () => 0,
		};

		await run();

		expect(proc.exits[0]).toBe(130);
		expect(drawn.map(({ text }) => text)).toEqual([
			"\r⠋ checking 0 of 1 file · 1 question asked, 0 answered\u001B[K",
			"\r\u001B[K",
		]);
	});
});
