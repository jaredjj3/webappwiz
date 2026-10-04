import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Judge } from "@webappwiz/scry";
import { FakeJudge, ruleDoc } from "@webappwiz/scry/testing";
import { color, MemoryLogger } from "webappwiz/log";
import { NodeFs, NodePs } from "webappwiz/system";
import { FakeProcess } from "webappwiz/system/testing";
import { FakeClock } from "webappwiz/time/testing";
import { check } from "./check";

describe("wiz scry", () => {
	const fs = new NodeFs();
	let root: string;
	let proc: FakeProcess;
	let ps: NodePs;
	let log: MemoryLogger;

	// plain lines, as on a pipe, whatever runs the tests
	const screen = { live: false, columns: 80, write: () => undefined };

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

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "rules-check-"));
		proc = new FakeProcess();
		// HOME points into the sandbox so no real user config is read
		proc.env = { PATH: process.env.PATH, HOME: root };
		ps = new NodePs({ proc });
		proc.chdir(root);
		log = new MemoryLogger();
		judge = new FakeJudge(0.9);
		asked = [];
		await git("init", "-q", "-b", "main");
		await git("config", "user.email", "t@example.com");
		await git("config", "user.name", "T");
		await fs.mkdir(`${root}/.wiz/scry/no-foo`);
		await fs.write(
			`${root}/.wiz/scry/no-foo/RULE.md`,
			ruleDoc("no-foo", { description: "No foo." }),
		);
		await fs.write(`${root}/a.ts`, "const a = 1;\n");
		await git("add", ".");
		await git("commit", "-qm", "base");
		await fs.write(`${root}/a.ts`, "const foo = 1;\n");
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const run = (format = "text", paths: string[] = [], model?: string) =>
		check({ paths, format, model, log, fs, ps, screen, providers });

	it("prints the findings under their file, how sure the model is, and exits 1 on an error", async () => {
		await run();

		expect(printed()).toEqual(
			[
				"a.ts",
				"  1   error   90%   No foo.   no-foo",
				"",
				"✖ 1 problem (1 error, 0 warnings) in 1 file since HEAD",
			].join("\n"),
		);
		expect(proc.exits).toEqual([1]);
	});

	it("says so when the model is not sure enough of anything, and exits 0", async () => {
		judge = new FakeJudge(0.2);

		await run();

		expect(printed()).toEqual("✔ no problems in 1 file since HEAD");
		expect(proc.exits).toEqual([]);
	});

	it("prints the report as JSON when asked, probabilities and all", async () => {
		await run("json");

		expect(JSON.parse(printed())).toMatchObject({
			since: "HEAD",
			findings: [
				{
					file: "a.ts",
					line: 1,
					rule: "no-foo",
					level: "error",
					probability: 0.9,
				},
			],
		});
	});

	it("reports a file whose judge failed as not checked, and exits 2", async () => {
		judge = new FakeJudge(new Error("Workers AI answered 401"));

		await run();

		expect(printed()).toContain("not checked");
		expect(printed()).toContain("a.ts   Workers AI answered 401");
		expect(printed()).toEndWith(
			"⚠ no problems found in 1 file since HEAD, but 1 not checked",
		);
		expect(proc.exits).toEqual([2]);
	});

	it("judges each effort by its model: clef, unless the config says", async () => {
		await fs.mkdir(`${root}/.wiz/scry/deep`);
		await fs.write(
			`${root}/.wiz/scry/deep/RULE.md`,
			ruleDoc("deep", { effort: "high" }),
		);

		await run();
		proc.env.WIZ_SCRY_MODEL_HIGH = "jev-latest";
		await run();

		expect(asked).toEqual(["clef", "clef", "clef", "jev-latest"]);
	});

	it("judges every effort by the one model it is given", async () => {
		await fs.mkdir(`${root}/.wiz/scry/deep`);
		await fs.write(
			`${root}/.wiz/scry/deep/RULE.md`,
			ruleDoc("deep", { effort: "high" }),
		);

		await run("text", [], "jev-preview");

		expect(asked).toEqual(["jev-preview", "jev-preview"]);
	});

	it("says so when nothing changed", async () => {
		await git("commit", "-qam", "change");

		await run();

		expect(warned()).toEqual(["nothing changed since main"]);
	});

	it("checks only the changed files under the paths it is given, from the working directory", async () => {
		await fs.mkdir(`${root}/src`);
		await fs.write(`${root}/src/b.ts`, "const foo = 2;\n");
		proc.chdir(`${root}/src`);

		await run("json", ["."]);

		expect(JSON.parse(printed()).findings).toMatchObject([
			{ file: "src/b.ts", line: 1, rule: "no-foo" },
		]);
	});

	it("says where it looked when nothing changed under the paths", async () => {
		await fs.mkdir(`${root}/src`);

		await run("text", ["src"]);

		expect(warned()).toEqual(["nothing changed since main in src"]);
	});

	it("says what it is sending, and each call as it comes back, on stderr", async () => {
		judge = new FakeJudge(0);

		await check({
			paths: [],
			format: "text",
			log,
			fs,
			ps,
			screen,
			providers,
			clock: new FakeClock(),
		});

		expect(warned().map((line) => color.strip(line))).toEqual([
			expect.stringMatching(
				/^sending 1 call \(~\d+ input tokens\), 1 at a time$/,
			),
			"  [1/1] medium: a.ts (0s)",
		]);
		expect(printed()).toEqual("✔ no problems in 1 file since HEAD");
	});

	it("stops on the first ctrl-c, reports what came back, and quits on the next", async () => {
		judge = { judge: () => new Promise(() => undefined) };
		setTimeout(() => proc.dispatch("SIGINT"), 200);

		await run();

		expect(printed()).toEqual(
			[
				"not checked",
				"  a.ts   cancelled",
				"",
				"⚠ cancelled: no problems found in 1 file since HEAD, but 1 not checked",
			].join("\n"),
		);
		expect(proc.exits).toEqual([2]);
		proc.dispatch("SIGINT");
		expect(proc.exits).toEqual([2, 130]);
	});

	it("says what the judges really spent when they report it", async () => {
		judge = new FakeJudge(0, { input: 7000 });

		await run();

		expect(printed()).toEqual(
			[
				"✔ no problems in 1 file since HEAD",
				"  spent 7k input tokens across 1 call",
			].join("\n"),
		);
	});
});
