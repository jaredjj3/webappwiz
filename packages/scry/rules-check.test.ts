import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFs } from "webappwiz/system";
import { Rules } from "./rules";
import { FakeDecider, ruleDoc } from "./testing";

describe("Rules.check", () => {
	const fs = new NodeFs();
	let root: string;

	/** Installs a rule, with a check when one is given. */
	const install = async (id: string, check?: string, doc = ruleDoc(id)) => {
		await fs.mkdir(`${root}/.wiz/scry/${id}`);
		await fs.write(`${root}/.wiz/scry/${id}/RULE.md`, doc);
		if (check !== undefined) {
			await fs.write(`${root}/.wiz/scry/${id}/rule.ts`, check);
		}
	};
	const write = (path: string, text: string) =>
		fs.write(`${root}/${path}`, text);
	const run = async (paths: string[], decider = new FakeDecider()) =>
		(await Rules.load(root, { fs })).check({ paths, tools: { decider } });

	/** A check flagging each line holding `word`, as sure as it is told. */
	const flagging = (word: string, confidence = 1) => `
		export default class {
			async check(file) {
				return file.lines.flatMap((line, index) =>
					line.includes("${word}") ? [{ line: index + 1, message: "no ${word}", confidence: ${confidence} }] : [],
				);
			}
		}
	`;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "scry-rules-"));
		await fs.mkdir(`${root}/src`);
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("reports what each rule's check finds, by path then line, with the rule's level", async () => {
		await install("no-foo", flagging("foo"));
		await install(
			"no-bar",
			flagging("bar"),
			ruleDoc("no-bar", { level: "warning" }),
		);
		await write("src/b.ts", "foo\n");
		await write("src/a.ts", "bar\nfoo\n");

		const report = await run(["src/a.ts", "src/b.ts"]);

		expect(
			report.problems.map(
				({ path, line, rule, level }) => `${path}:${line} ${rule} ${level}`,
			),
		).toEqual([
			"src/a.ts:1 no-bar warning",
			"src/a.ts:2 no-foo error",
			"src/b.ts:1 no-foo error",
		]);
		expect([report.files, report.rules]).toEqual([2, 2]);
	});

	it("checks a file only against the rules whose files it matches", async () => {
		await install(
			"no-foo",
			flagging("foo"),
			ruleDoc("no-foo", { files: "**/*.md" }),
		);
		await write("src/a.ts", "foo\n");

		const report = await run(["src/a.ts"]);

		expect([report.problems, report.files, report.rules]).toEqual([[], 0, 0]);
	});

	it("drops what falls under the rule's threshold, and what a scry-ignore excuses", async () => {
		await install(
			"unsure",
			flagging("foo", 0.4),
			ruleDoc("unsure", { threshold: 0.5 }),
		);
		await install("loud", flagging("bar"));
		await write("src/a.ts", "foo\n// scry-ignore loud: a reason\nbar\n");

		const report = await run(["src/a.ts"]);

		expect([report.problems, report.dropped, report.ignored]).toEqual([
			[],
			1,
			1,
		]);
	});

	it("builds each rule with the tools, so its check can ask the decider", async () => {
		await install(
			"asks",
			`export default class {
				constructor(tools) { this.decider = tools.decider; }
				async check(file) {
					const [comment] = file.ts.comments();
					return [comment.flag("restates", await this.decider.decide("Does it restate?", comment), "Does it restate?")];
				}
			}`,
		);
		await write("src/a.ts", "// add one\nn += 1;\n");
		const decider = new FakeDecider({ "add one": 0.9 });

		const report = await run(["src/a.ts"], decider);

		expect(report.problems).toMatchObject([
			{ line: 1, confidence: 0.9, decidedBy: "Does it restate?" },
		]);
		expect(decider.asked.map(({ about }) => about.text)).toEqual([
			"// add one",
		]);
	});

	it("lists the rules that have no check yet", async () => {
		await install("no-foo");
		await write("src/a.ts", "foo\n");

		expect((await run(["src/a.ts"])).withoutCheck).toEqual(["no-foo"]);
	});

	it("reports a rule unchecked on a file its check threw on, and checks the rest", async () => {
		await install(
			"fragile",
			`export default class { async check(file) { if (file.path.endsWith("a.ts")) throw new Error("boom"); return []; } }`,
		);
		await install("no-foo", flagging("foo"));
		await write("src/a.ts", "foo\n");

		const report = await run(["src/a.ts"]);

		expect(report.unchecked).toEqual([
			{ subject: "fragile on src/a.ts", reason: "boom" },
		]);
		expect(report.problems.map((problem) => problem.rule)).toEqual(["no-foo"]);
	});

	it("reports a rule unchecked whose rule.ts exports no class", async () => {
		await install("empty", "export const nothing = 1;\n");
		await write("src/a.ts", "x\n");

		expect((await run(["src/a.ts"])).unchecked).toEqual([
			{
				subject: "empty",
				reason:
					".wiz/scry/empty/rule.ts does not default-export the rule's class",
			},
		]);
	});

	it("names the files still using rule-ignore", async () => {
		await install("no-foo", flagging("foo"));
		await write("src/a.ts", "// rule-ignore no-foo: old spelling\nfoo\n");

		const report = await run(["src/a.ts"]);

		expect([report.legacy, report.ignored]).toEqual([["src/a.ts"], 1]);
	});

	it("checks no rule's cases, wherever the rule lives, since they break it on purpose", async () => {
		await install("no-foo", flagging("foo"));
		await fs.mkdir(`${root}/.wiz/scry/no-foo/evals`);
		await write(".wiz/scry/no-foo/evals/a.bad.ts", "foo\n");
		await fs.mkdir(`${root}/catalog/no-bar/evals`);
		await write("catalog/no-bar/RULE.md", ruleDoc("no-bar"));
		await write("catalog/no-bar/evals/b.bad.ts", "foo\n");
		await fs.mkdir(`${root}/src/evals`);
		await write("src/evals/c.ts", "foo\n");

		const report = await run([
			".wiz/scry/no-foo/evals/a.bad.ts",
			"catalog/no-bar/evals/b.bad.ts",
			"src/evals/c.ts",
		]);

		expect(report.problems.map(({ path }) => path)).toEqual(["src/evals/c.ts"]);
	});

	it("checks a rule's own code with every rule but itself", async () => {
		await install("no-foo", flagging("foo"));
		await install("loud", flagging("foo"));
		await write(".wiz/scry/no-foo/rule.test.ts", "foo\n");

		const report = await run([".wiz/scry/no-foo/rule.test.ts"]);

		expect(report.problems.map(({ rule }) => rule)).toEqual(["loud"]);
	});

	it("scores each rule on its cases, with what stands of what it found", async () => {
		await install("no-bar", flagging("Bar"));
		await fs.mkdir(`${root}/.wiz/scry/no-bar/evals`);
		await write(
			".wiz/scry/no-bar/evals/a.good.ts",
			"// scry-ignore no-bar: on purpose\nBar\n",
		);
		await write(".wiz/scry/no-bar/evals/b.good.ts", "Bar\n");
		await install("unwritten");

		const measured = await (await Rules.load(root, { fs })).measure({
			tools: { decider: new FakeDecider() },
		});

		expect(
			measured.map(({ rule, cases }) => [
				rule,
				cases.map(({ name, kind, findings }) => [
					name,
					kind,
					findings.map(({ line }) => line),
				]),
			]),
		).toEqual([
			[
				"no-bar",
				[
					["RULE.md good 1", "good", []],
					["RULE.md bad 1", "bad", [2]],
					["evals/a.good.ts", "good", []],
					["evals/b.good.ts", "good", [1]],
				],
			],
			["unwritten", []],
		]);
	});

	it("records a case the rule threw on, and refuses a rule that is not there", async () => {
		await install(
			"fragile",
			"export default class { async check() { throw new Error('boom'); } }",
		);
		const rules = await Rules.load(root, { fs });

		const [measured] = await rules.measure({
			ids: ["fragile"],
			tools: { decider: new FakeDecider() },
		});

		expect(measured?.cases.map(({ error }) => error)).toEqual(["boom", "boom"]);
		await expect(
			rules.measure({ ids: ["nope"], tools: { decider: new FakeDecider() } }),
		).rejects.toThrow('no rule "nope" in .wiz/scry');
	});
});
