import { describe, expect, it } from "bun:test";
import { Block } from "./block";
import { Rule } from "./rule";
import { ruleDoc } from "./testing";

describe("Block", () => {
	const rule = (id: string, level: "error" | "warning" = "error") =>
		Rule.parse(ruleDoc(id, { complexity: "low", level }));

	const block = (...rules: Rule[]) =>
		new Block(1, rules.length > 0 ? rules : [rule("no-foo")], [
			{ path: "a.ts", added: false },
		]);

	it("heads itself with its number, its size, and the complexity", () => {
		expect(block(rule("no-foo"), rule("no-bar")).heading()).toEqual(
			"## block 1 (2 rules, 1 file, complexity low)",
		);
	});

	it("takes the complexity its rules share", () => {
		expect(block().complexity).toEqual("low");
	});

	it("refuses to be a block with no rules to apply", () => {
		expect(() => new Block(3, [], [{ path: "a.ts", added: false }])).toThrow(
			"block 3 has no rules",
		);
	});

	it("names each rule's file rather than quoting it, with its level", () => {
		const prompt = block(rule("no-foo"), rule("no-bar", "warning")).prompt(
			"main",
		);

		expect(prompt).toContain("- `.wiz/rules/no-foo/RULE.md` (no-foo, error)");
		expect(prompt).toContain("- `.wiz/rules/no-bar/RULE.md` (no-bar, warning)");
		expect(prompt).not.toContain("Prose about no-foo");
	});

	it("tells the subagent how to see the change, and lists the files", () => {
		const prompt = new Block(
			1,
			[rule("no-foo")],
			[
				{ path: "a.ts", added: false },
				{ path: "b.ts", added: true },
			],
		).prompt("main");

		expect(prompt).toContain("`git diff main -- <file>`");
		expect(prompt).toContain("\n- a.ts\n- b.ts (new)\n");
	});

	it("names the ignore markers over whichever rule they name", () => {
		const prompt = block().prompt("main");

		expect(prompt).toContain("`rule-ignore <rule>: <reason>`");
		expect(prompt).toContain("`rule-ignore-file <rule>: <reason>`");
	});

	it("ends with a reply contract that attributes each finding to a rule", () => {
		const prompt = block().prompt("main");

		expect(prompt).toMatch(/Reply with only a JSON array.*"message"[^\n]*$/s);
		expect(prompt).toContain('"rule": "<the rule it breaks>"');
	});
});
