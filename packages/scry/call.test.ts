import { describe, expect, it } from "bun:test";
import { Call, type CallFile } from "./call";
import { Rule } from "./rule";
import { ruleDoc } from "./testing";

describe("Call", () => {
	const noFoo = Rule.parse(ruleDoc("no-foo", { description: "No foo." }));
	const noBar = Rule.parse(
		ruleDoc("no-bar", { level: "warning", threshold: 0.8 }),
	);
	// lines 2, 3 and 5 are new
	const diff = [
		"--- a/src/a.ts",
		"+++ b/src/a.ts",
		"@@ -1,3 +1,5 @@",
		" const a = 1;",
		"+const b = 2;",
		"+const c = 3;",
		" const d = 4;",
		"-const gone = 0;",
		"+const e = 5;",
	].join("\n");
	const text = [
		"const a = 1;",
		"const b = 2;",
		"const c = 3;",
		"const d = 4;",
		"const e = 5;",
	].join("\n");
	const file = (
		opts: Partial<CallFile> & { text?: string } = {},
	): CallFile => ({
		file: { path: "src/a.ts", diff },
		text,
		candidates: new Map(),
		...opts,
	});
	const verdict = (...answers: number[]) => ({
		answers: new Map(answers.map((answer, index) => [`q${index}`, answer])),
	});

	it("asks about each run of added lines, once a rule", () => {
		const [call] = Call.plan({
			effort: "low",
			rules: [noFoo, noBar],
			file: file(),
		});

		expect(
			Object.values(call?.judgment.questions ?? {}).map(
				(question) => question.instructions,
			),
		).toEqual([
			expect.stringContaining('`rules["no-foo"]` at lines 2 to 3 of `file`'),
			expect.stringContaining('`rules["no-foo"]` at line 5 of `file`'),
			expect.stringContaining('`rules["no-bar"]` at lines 2 to 3 of `file`'),
			expect.stringContaining('`rules["no-bar"]` at line 5 of `file`'),
		]);
	});

	it("puts the numbered file, the diff and each rule once in the state", () => {
		const [call] = Call.plan({
			effort: "low",
			rules: [noFoo, noBar],
			file: file(),
		});

		expect(call?.judgment.state).toEqual({
			path: "src/a.ts",
			file: expect.stringContaining("    2| const b = 2;"),
			diff,
			rules: {
				"no-foo": noFoo.document.trim(),
				"no-bar": noBar.document.trim(),
			},
		});
	});

	it("asks about each line a script flagged", () => {
		const [call] = Call.plan({
			effort: "low",
			rules: [noFoo],
			file: file({
				candidates: new Map([
					[
						"no-foo",
						[{ file: "src/a.ts", line: 4, message: "looks like foo" }],
					],
				]),
			}),
		});

		expect(call?.judgment.questions.q2?.instructions).toEqual(
			'A script flagged line 4 of `file`: "looks like foo". Does that line break the rule in `rules["no-foo"]`?',
		);
		expect(call?.findings(verdict(0, 0, 0.9))).toEqual([
			{
				file: "src/a.ts",
				line: 4,
				level: "error",
				rule: "no-foo",
				message: "looks like foo",
				probability: 0.9,
			},
		]);
	});

	it("reports each answer at or above its rule's threshold, under the rule's description", () => {
		const [call] = Call.plan({
			effort: "low",
			rules: [noFoo, noBar],
			file: file(),
		});

		expect(call?.findings(verdict(0.7, 0.69, 0.79, 0.8))).toEqual([
			{
				file: "src/a.ts",
				line: 2,
				level: "error",
				rule: "no-foo",
				message: "No foo.",
				probability: 0.7,
			},
			{
				file: "src/a.ts",
				line: 5,
				level: "warning",
				rule: "no-bar",
				message: "Prose about no-bar.",
				probability: 0.8,
			},
		]);
	});

	it("keeps the likelier of two findings on one line", () => {
		const [call] = Call.plan({
			effort: "low",
			rules: [noFoo],
			file: file({
				candidates: new Map([
					["no-foo", [{ file: "src/a.ts", line: 2, message: "flagged" }]],
				]),
			}),
		});

		expect(
			call?.findings(verdict(0.6, 0, 0.9)).map((found) => found.message),
		).toEqual(["flagged"]);
	});

	it("refuses a verdict that leaves a question unanswered", () => {
		const [call] = Call.plan({ effort: "low", rules: [noFoo], file: file() });

		expect(() => call?.findings(verdict(0.1))).toThrow(
			"the verdict answered 1 of 2 questions",
		);
	});

	it("never asks about lines or files a scry-ignore excuses", () => {
		const excused = file({
			text: text.replace(
				"const e",
				"// scry-ignore no-foo: on purpose\nconst e",
			),
			file: {
				path: "src/a.ts",
				diff: "@@ -0,0 +1,6 @@\n+1\n+2\n+3\n+4\n+5\n+6",
			},
		});
		const [call] = Call.plan({ effort: "low", rules: [noFoo], file: excused });
		const none = Call.plan({
			effort: "low",
			rules: [noFoo],
			file: file({ text: `// scry-ignore-file no-foo: all of it\n${text}` }),
		});

		expect(
			Object.values(call?.judgment.questions ?? {}).map(
				(question) => question.instructions,
			),
		).toEqual([expect.stringContaining("at lines 1 to 5 of")]);
		expect(none).toEqual([]);
	});

	it("splits a file with more than 64 questions across calls", () => {
		const long = Array.from({ length: 140 }, (_, index) => `+${index}`);
		// every other line, so each is a run of its own
		const sparse = long.map((line, index) =>
			index % 2 === 0 ? line : ` ${index}`,
		);
		const calls = Call.plan({
			effort: "low",
			rules: [noFoo],
			file: file({
				file: {
					path: "src/a.ts",
					diff: `@@ -1,70 +1,140 @@\n${sparse.join("\n")}`,
				},
			}),
		});

		expect(
			calls.map((call) => Object.keys(call.judgment.questions).length),
		).toEqual([64, 6]);
	});

	it("estimates its tokens at four characters each", () => {
		const [call] = Call.plan({ effort: "low", rules: [noFoo], file: file() });

		expect(call?.tokens).toEqual(
			Math.ceil(JSON.stringify(call?.judgment).length / 4),
		);
	});
});
