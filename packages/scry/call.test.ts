import { describe, expect, it } from "bun:test";
import { Call } from "./call";
import { Rule } from "./rule";
import { ruleDoc } from "./testing";

describe("Call", () => {
	const rules = [
		Rule.parse(ruleDoc("no-foo")),
		Rule.parse(ruleDoc("no-bar", { level: "warning" })),
	];
	const first = {
		file: { path: "src/a.ts", diff: "+const a = 1;" },
		text: "const a = 1;\nconst b = 2;",
		candidates: new Map([
			["no-foo", [{ file: "src/a.ts", line: 2, message: "looks like foo" }]],
		]),
	};
	const second = {
		file: { path: "src/b.ts", diff: "+const c = 3;" },
		text: "const c = 3;",
		candidates: new Map(),
	};
	const call = new Call({ effort: "low", rules, files: [first] });
	const batch = new Call({ effort: "low", rules, files: [first, second] });

	it("puts every rule, the numbered file, the diff and the candidates in its prompt", () => {
		expect(call.prompt).toContain('<rule id="no-foo" level="error">');
		expect(call.prompt).toContain('<rule id="no-bar" level="warning">');
		expect(call.prompt).toContain("    2| const b = 2;");
		expect(call.prompt).toContain("+const a = 1;");
		expect(call.prompt).toContain("- no-foo, src/a.ts line 2: looks like foo");
		expect(call.prompt).toContain("scry-ignore <rule>: <reason>");
	});

	it("holds each file of a batch and its diff once, under the rules once", () => {
		expect(batch.files).toEqual(["src/a.ts", "src/b.ts"]);
		expect(batch.prompt.split('<rule id="no-foo"').length).toEqual(2);
		expect(batch.prompt).toContain('<file path="src/b.ts">');
		expect(batch.prompt).toContain('<diff path="src/b.ts">');
		expect(batch.prompt).toContain("+const c = 3;");
	});

	it("reads each finding of a batch against the file it names", () => {
		const reply =
			'[{"file": "src/b.ts", "rule": "no-foo", "line": 1, "message": "foo"}, {"file": "src/else.ts", "rule": "no-foo", "line": 1, "message": "x"}, {"rule": "no-foo", "line": 1, "message": "which?"}]';

		expect(batch.findings(reply)).toEqual([
			{
				file: "src/b.ts",
				line: 1,
				level: "error",
				rule: "no-foo",
				message: "foo",
			},
		]);
	});

	it("estimates its tokens at four characters each", () => {
		expect(call.tokens).toEqual(Math.ceil(call.prompt.length / 4));
	});

	it("reads the last JSON array in a reply, past any talk around it", () => {
		const reply =
			'Looked at [the file].\n[{"rule": "no-bar", "line": 1, "message": "bar"}]\nDone.';

		expect(call.findings(reply)).toEqual([
			{
				file: "src/a.ts",
				line: 1,
				level: "warning",
				rule: "no-bar",
				message: "bar",
			},
		]);
	});

	it("reads an empty array as nothing found", () => {
		expect(call.findings("[]")).toEqual([]);
	});

	it("drops findings for rules it did not ask about", () => {
		expect(
			call.findings('[{"rule": "other", "line": 1, "message": "x"}]'),
		).toEqual([]);
	});

	it("refuses a reply with no array of findings in it", () => {
		expect(() => call.findings("all good!")).toThrow(
			"the reply held no JSON array of findings",
		);
		expect(() => call.findings('[{"rule": "no-foo"}]')).toThrow(
			"the reply held no JSON array of findings",
		);
	});
});
