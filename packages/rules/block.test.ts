import { describe, expect, it } from "bun:test";
import { Block } from "./block";
import { Rule } from "./rule";
import { ruleDoc } from "./testing";

describe("Block", () => {
	const rule = (hints?: string) =>
		Rule.parse(ruleDoc("no-foo", { complexity: "low", hints }));

	it("heads itself with the rule, the size, and the complexity", () => {
		const block = new Block(rule(), [{ path: "a.ts", added: false }]);

		expect(block.heading()).toEqual("## no-foo (1 file, complexity low)");
	});

	it("says which part it is when the rule needed several", () => {
		const block = new Block(rule(), [{ path: "a.ts", added: false }], {
			part: 2,
			parts: 3,
		});

		expect(block.heading()).toEqual("## no-foo 2/3 (1 file, complexity low)");
	});

	it("names the rule's file rather than quoting it", () => {
		const prompt = new Block(rule(), [{ path: "a.ts", added: false }]).prompt(
			"main",
		);

		expect(prompt).toContain("Read `.wiz/rules/no-foo/RULE.md`");
		expect(prompt).not.toContain("Prose about no-foo");
	});

	it("tells the subagent how to see the change, and lists the files", () => {
		const prompt = new Block(rule(), [
			{ path: "a.ts", added: false },
			{ path: "b.ts", added: true },
		]).prompt("main");

		expect(prompt).toContain("`git diff main -- <file>`");
		expect(prompt).toContain("\n- a.ts\n- b.ts (new)\n");
	});

	it("carries the rule's hints under the heading, when it has any", () => {
		const prompt = new Block(rule("grep first"), [
			{ path: "a.ts", added: false },
		]).prompt("main");

		expect(prompt.split("\n").slice(0, 2)).toEqual([
			"## no-foo (1 file, complexity low)",
			"hints: grep first",
		]);
	});

	it("leaves the hints line out when the rule has none", () => {
		const prompt = new Block(rule(), [{ path: "a.ts", added: false }]).prompt(
			"main",
		);

		expect(prompt).not.toContain("hints:");
	});

	it("names the ignore markers for this rule", () => {
		const prompt = new Block(rule(), [{ path: "a.ts", added: false }]).prompt(
			"main",
		);

		expect(prompt).toContain("`rule-ignore no-foo: <reason>`");
		expect(prompt).toContain("`rule-ignore-file no-foo: <reason>`");
	});

	it("ends with the reply contract", () => {
		const prompt = new Block(rule(), [{ path: "a.ts", added: false }]).prompt(
			"main",
		);

		expect(prompt).toMatch(/Reply with only a JSON array.*"message"[^\n]*$/s);
	});
});
