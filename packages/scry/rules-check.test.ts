import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFs } from "webappwiz/system";
import type { Decider } from "./decider";
import { Progress } from "./progress";
import { Rules } from "./rules";
import { FakeDecider, type RuleSourceOptions, ruleSource } from "./testing";

describe("Rules.check", () => {
	const fs = new NodeFs();
	let root: string;
	let progress: Progress;

	/** Installs a rule whose `rule.ts` is `source`. */
	const install = async (id: string, source: string) => {
		await fs.mkdir(`${root}/.wiz/scry/${id}`);
		await fs.write(`${root}/.wiz/scry/${id}/rule.ts`, source);
	};
	const write = (path: string, text: string) =>
		fs.write(`${root}/${path}`, text);
	/** Resolves once `ready` holds, checking each millisecond. */
	const until = async (ready: () => boolean): Promise<void> => {
		while (!ready()) {
			await new Promise((resolve) => setTimeout(resolve, 1));
		}
	};
	const run = async (paths: string[], som: Decider = new FakeDecider()) =>
		(await Rules.load(root, { fs })).check({
			paths,
			tools: { som, llm: new FakeDecider() },
			progress,
		});

	/** A rule asking the som whether a file's first comment restates the code. */
	const asking = ruleSource(
		`constructor(tools) { this.som = tools.som; }
		async check(file) {
			const [comment] = file.ts.comments();
			return comment === undefined ? [] : [comment.flag("restates", await this.som.decide("Does it restate?", comment), "Does it restate?")];
		}`,
	);
	/** A rule flagging each line holding `word`, as sure as it is told. */
	const flagging = (
		word: string,
		confidence = 1,
		opts: RuleSourceOptions = {},
	) =>
		ruleSource(
			`async check(file) {
				return file.lines.flatMap((line, index) =>
					line.includes("${word}") ? [{ line: index + 1, message: "no ${word}", confidence: ${confidence} }] : [],
				);
			}`,
			opts,
		);

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "scry-rules-"));
		progress = new Progress();
		await fs.mkdir(`${root}/src`);
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("reports what each rule's check finds, by path then line, with the rule's level", async () => {
		await install("no-foo", flagging("foo"));
		await install("no-bar", flagging("bar", 1, { level: "warning" }));
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

	it("checks with only the rules it is given, and refuses one that is not there", async () => {
		await install("no-foo", flagging("foo"));
		await install("no-bar", flagging("bar"));
		await write("src/a.ts", "foo\nbar\n");
		const rules = await Rules.load(root, { fs });
		const tools = { som: new FakeDecider(), llm: new FakeDecider() };

		const report = await rules.check({
			paths: ["src/a.ts"],
			ids: ["no-bar"],
			tools,
		});

		expect([report.problems.map(({ rule }) => rule), report.rules]).toEqual([
			["no-bar"],
			1,
		]);
		await expect(
			rules.check({ paths: ["src/a.ts"], ids: ["nope"], tools }),
		).rejects.toThrow('no rule "nope" in .wiz/scry');
	});

	it("checks a file only against the rules whose files it matches", async () => {
		await install("no-foo", flagging("foo", 1, { files: "**/*.md" }));
		await write("src/a.ts", "foo\n");

		const report = await run(["src/a.ts"]);

		expect([report.problems, report.files, report.rules]).toEqual([[], 0, 0]);
	});

	it("drops what falls under the rule's threshold, and what a scry-ignore excuses", async () => {
		await install("unsure", flagging("foo", 0.4, { threshold: 0.5 }));
		await install("loud", flagging("bar"));
		await write("src/a.ts", "foo\n// scry-ignore loud: a reason\nbar\n");

		const report = await run(["src/a.ts"]);

		expect([report.problems, report.dropped, report.ignored]).toEqual([
			[],
			1,
			1,
		]);
	});

	it("builds each rule with the tools, so its check can ask the som", async () => {
		await install("asks", asking);
		await write("src/a.ts", "// add one\nn += 1;\n");
		const som = new FakeDecider({ "add one": 0.9 });

		const report = await run(["src/a.ts"], som);

		expect(report.problems).toMatchObject([
			{ line: 1, confidence: 0.9, decidedBy: "Does it restate?" },
		]);
		expect(som.asked.map(({ about }) => about.text)).toEqual(["// add one"]);
	});

	it("reports a rule unchecked on a file its check threw on, and checks the rest", async () => {
		await install(
			"fragile",
			ruleSource(
				`async check(file) { if (file.path.endsWith("a.ts")) throw new Error("boom"); return []; }`,
			),
		);
		await install("no-foo", flagging("foo"));
		await write("src/a.ts", "foo\n");

		const report = await run(["src/a.ts"]);

		expect(report.unchecked).toEqual([
			{ subject: "fragile on src/a.ts", reason: "boom" },
		]);
		expect(report.problems.map((problem) => problem.rule)).toEqual(["no-foo"]);
	});

	it("reports a rule unchecked whose class throws on being built", async () => {
		await install(
			"broken",
			ruleSource('constructor() { throw new Error("no tools"); }'),
		);
		await write("src/a.ts", "x\n");

		expect((await run(["src/a.ts"])).unchecked).toEqual([
			{ subject: "broken", reason: "no tools" },
		]);
	});

	it("counts a file done once every rule that matched it is, out of a total known from the start", async () => {
		await install("no-foo", flagging("foo"));
		await install("asks", asking);
		await write("src/a.ts", "foo\n");
		await write("src/b.ts", "// add one\nn += 1;\n");
		let answer: ((probability: number) => void) | undefined;
		const som = {
			decide: () =>
				new Promise<number>((resolve) => {
					answer = resolve;
				}),
		};

		const checking = run(["src/a.ts", "src/b.ts"], som);
		// b.ts can reach the som after a.ts is done, so answering as soon
		// as a.ts is done could answer nothing and leave b.ts waiting forever
		await until(() => progress.done > 0 && answer !== undefined);

		expect([progress.done, progress.total]).toEqual([1, 2]);
		answer?.(0.9);
		await checking;
		expect([progress.done, progress.total]).toEqual([2, 2]);
	});

	it("counts a file done when a rule threw on it, or could not be built", async () => {
		await install(
			"fragile",
			ruleSource('async check() { throw new Error("boom"); }'),
		);
		await install(
			"broken",
			ruleSource('constructor() { throw new Error("no tools"); }'),
		);
		await write("src/a.ts", "x\n");
		await write("src/b.ts", "y\n");

		await run(["src/a.ts", "src/b.ts"]);

		expect([progress.done, progress.total]).toEqual([2, 2]);
	});

	it("names the files still using rule-ignore", async () => {
		await install("no-foo", flagging("foo"));
		await write("src/a.ts", "// rule-ignore no-foo: old spelling\nfoo\n");

		const report = await run(["src/a.ts"]);

		expect([report.legacy, report.ignored]).toEqual([["src/a.ts"], 1]);
	});

	it("names no file that only mentions rule-ignore outside a comment naming a rule", async () => {
		await install("no-foo", flagging("foo"));
		await write(
			"src/a.ts",
			'/** Reads a rule-ignore directive. */\nwrite("// rule-ignore no-foo: x");\n',
		);

		const report = await run(["src/a.ts"]);

		expect(report.legacy).toEqual([]);
	});

	it("checks no rule's cases, wherever the rule lives, since they break it on purpose", async () => {
		await install("no-foo", flagging("foo"));
		await fs.mkdir(`${root}/.wiz/scry/no-foo/evals`);
		await write(".wiz/scry/no-foo/evals/a.bad.ts", "foo\n");
		await fs.mkdir(`${root}/catalog/no-bar/evals`);
		await write("catalog/no-bar/rule.ts", flagging("foo"));
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

	it("scores each rule on its cases, with what stands of what it found, counting each case scored", async () => {
		await install("no-bar", flagging("Bar"));
		await fs.mkdir(`${root}/.wiz/scry/no-bar/evals`);
		await write(
			".wiz/scry/no-bar/evals/a.good.ts",
			"// scry-ignore no-bar: on purpose\nBar\n",
		);
		await write(".wiz/scry/no-bar/evals/b.good.ts", "Bar\n");

		const evaluated = await (await Rules.load(root, { fs })).evaluate({
			tools: { som: new FakeDecider(), llm: new FakeDecider() },
			progress,
		});

		expect(
			evaluated.map(({ rule, cases }) => [
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
					["evals/a.good.ts", "good", []],
					["evals/b.good.ts", "good", [1]],
				],
			],
		]);
		expect([progress.done, progress.total]).toEqual([2, 2]);
	});

	it("records a case the rule threw on, and refuses a rule that is not there", async () => {
		await install(
			"fragile",
			ruleSource("async check() { throw new Error('boom'); }"),
		);
		await fs.mkdir(`${root}/.wiz/scry/fragile/evals`);
		await write(".wiz/scry/fragile/evals/a.good.ts", "a\n");
		await write(".wiz/scry/fragile/evals/b.bad.ts", "b\n");
		const rules = await Rules.load(root, { fs });

		const [evaluated] = await rules.evaluate({
			ids: ["fragile"],
			tools: { som: new FakeDecider(), llm: new FakeDecider() },
		});

		expect(evaluated?.cases.map(({ error }) => error)).toEqual([
			"boom",
			"boom",
		]);
		await expect(
			rules.evaluate({
				ids: ["nope"],
				tools: { som: new FakeDecider(), llm: new FakeDecider() },
			}),
		).rejects.toThrow('no rule "nope" in .wiz/scry');
	});
});
