import { beforeEach, describe, expect, it } from "bun:test";
import { FakeFs } from "webappwiz/system/testing";
import { Evaluation } from "./evaluation";
import type { Judge } from "./judge";
import { Rule } from "./rule";
import { FakeJudge, ruleDoc } from "./testing";

describe("Evaluation", () => {
	let fs: FakeFs;
	// ruleDoc has one Good example, `class Foo {}`, and one Bad, which adds `class Bar {}`
	const noFoo = Rule.parse(ruleDoc("no-foo", { effort: "low" }));
	const strict = Rule.parse(
		ruleDoc("strict", { effort: "high", threshold: 0.9 }),
	);
	const withEvals = Rule.parse(ruleDoc("no-foo", { effort: "low" }), {
		evals: [
			".wiz/scry/no-foo/evals/two-classes.bad.ts",
			".wiz/scry/no-foo/evals/one-class.good.ts",
		],
	});

	/** Says yes to code holding a second class, as sure as it is told, and no to the rest. */
	const knowing = (sure: number): Judge => ({
		judge: async (judgment) => ({
			answers: new Map(
				Object.keys(judgment.questions).map((id) => [
					id,
					String(judgment.state.file).includes("Bar") ? sure : 1 - sure,
				]),
			),
		}),
	});

	beforeEach(async () => {
		fs = new FakeFs();
		await fs.mkdir("/p/.wiz/scry/no-foo/evals");
		await fs.write(
			"/p/.wiz/scry/no-foo/evals/two-classes.bad.ts",
			"class Bar {}\nclass Baz {}",
		);
		await fs.write(
			"/p/.wiz/scry/no-foo/evals/one-class.good.ts",
			"class Qux {}",
		);
	});

	it("reads the code blocks under a rule's Good and Bad", () => {
		expect(Evaluation.examples(noFoo)).toEqual([
			{
				rule: "no-foo",
				kind: "good",
				source: "RULE.md good 1",
				path: "example.ts",
				code: "class Foo {}",
			},
			{
				rule: "no-foo",
				kind: "bad",
				source: "RULE.md bad 1",
				path: "example.ts",
				code: "class Foo {}\nclass Bar {}",
			},
		]);
	});

	it("reads a rule's eval cases, showing the model a name that does not say which they are", async () => {
		expect(await Evaluation.cases("/p", withEvals, fs)).toEqual([
			{
				rule: "no-foo",
				kind: "good",
				source: "evals/one-class.good.ts",
				path: "one-class.ts",
				code: "class Qux {}",
			},
			{
				rule: "no-foo",
				kind: "bad",
				source: "evals/two-classes.bad.ts",
				path: "two-classes.ts",
				code: "class Bar {}\nclass Baz {}",
			},
		]);
	});

	it("makes one call for each case, eval cases first, at its rule's effort", async () => {
		const evaluation = await Evaluation.prepare({
			dir: "/p",
			rules: [withEvals],
			fs,
		});

		expect(evaluation.size).toEqual(4);
		expect(evaluation.efforts).toEqual(new Set(["low"]));
	});

	it("marks each case right when its probability agrees with its kind at the rule's threshold", async () => {
		const evaluation = await Evaluation.prepare({
			dir: "/p",
			rules: [withEvals, strict],
			fs,
		});

		const report = await evaluation.run({
			judges: new Map([
				["low", knowing(0.8)],
				["high", knowing(0.8)],
			]),
			jobs: 2,
		});

		expect(
			report.rules.map(({ rule, examples }) => [
				rule,
				examples.map(({ source, probability, right }) => [
					source,
					Number(probability.toFixed(2)),
					right,
				]),
			]),
		).toEqual([
			[
				"no-foo",
				[
					["evals/one-class.good.ts", 0.2, true],
					["evals/two-classes.bad.ts", 0.8, true],
					["RULE.md good 1", 0.2, true],
					["RULE.md bad 1", 0.8, true],
				],
			],
			[
				"strict",
				[
					["RULE.md good 1", 0.2, true],
					["RULE.md bad 1", 0.8, false],
				],
			],
		]);
	});

	it("leaves out rules its scripts decide, which no model judges", async () => {
		const scripted = Rule.parse(ruleDoc("scripted", { effort: "none" }), {
			scripts: [".wiz/scry/scripted/scripts/check.sh"],
		});

		const evaluation = await Evaluation.prepare({
			dir: "/p",
			rules: [scripted],
			fs,
		});

		expect(evaluation.size).toEqual(0);
	});

	it("names the cases a judge failed on, and sums what it spent", async () => {
		const evaluation = await Evaluation.prepare({
			dir: "/p",
			rules: [noFoo],
			fs,
		});

		const failed = await evaluation.run({
			judges: new Map([["low", new FakeJudge(new Error("down"))]]),
			jobs: 1,
		});
		const spent = await evaluation.run({
			judges: new Map([["low", new FakeJudge(0, { input: 30 })]]),
			jobs: 1,
		});

		expect(failed.unchecked).toEqual([
			{ subject: "no-foo RULE.md good 1", reason: "down" },
			{ subject: "no-foo RULE.md bad 1", reason: "down" },
		]);
		expect(spent.usage).toEqual({ calls: 2, input: 60 });
	});
});
