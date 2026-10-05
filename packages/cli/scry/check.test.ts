import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Judge } from "@webappwiz/scry";
import { FakeJudge, ruleSource } from "@webappwiz/scry/testing";
import { color, MemoryLogger } from "webappwiz/log";
import { NodeFs, NodePs } from "webappwiz/system";
import { FakeProcess } from "webappwiz/system/testing";
import { check } from "./check";

describe("wiz scry", () => {
	const fs = new NodeFs();
	let root: string;
	let proc: FakeProcess;
	let ps: NodePs;
	let log: MemoryLogger;

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

	const run = (format = "text", paths: string[] = [], model?: string) =>
		check({ paths, format, model, log, fs, ps, providers });

	it("prints the problems under their file, how sure the check is, and exits 1 on an error", async () => {
		await run();

		expect(printed()).toEqual(
			[
				"a.ts",
				"  1   error   100%   no foo   no-foo",
				"",
				"✖ 1 problem (1 error, 0 warnings) in 1 file since HEAD",
			].join("\n"),
		);
		expect(proc.exits).toEqual([1]);
	});

	it("prints the report as JSON when asked, confidence and all", async () => {
		await run("json");

		expect(JSON.parse(printed())).toMatchObject({
			since: "HEAD",
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
			[
				"✔ no problems in 1 file since HEAD",
				"  asked 1 question in 1 request",
			].join("\n"),
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

	it("says so when nothing changed", async () => {
		await git("commit", "-qam", "change");

		await run();

		expect(warned()).toEqual(["nothing changed since main"]);
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

	it("stops on the first ctrl-c, reports what came back, and quits on the next", async () => {
		await install("why-not-what", asking);
		await fs.write(`${root}/a.ts`, "// add one\nconst a = 1;\n");
		judge = { judge: () => new Promise(() => undefined) };
		setTimeout(() => proc.dispatch("SIGINT"), 200);

		await run();

		expect(printed()).toEqual(
			[
				"not checked",
				"  why-not-what on a.ts   cancelled",
				"",
				"⚠ cancelled: no problems found in 1 file since HEAD, but 1 not checked",
				"  asked 1 question in 1 request",
			].join("\n"),
		);
		expect(proc.exits).toEqual([2]);
		proc.dispatch("SIGINT");
		expect(proc.exits).toEqual([2, 130]);
	});
});
