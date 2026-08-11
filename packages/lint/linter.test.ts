import { describe, expect, it } from "bun:test";
import { Finding } from "./finding";
import { Linter } from "./linter";
import type { Rule } from "./rule/rule";

const noX: Rule = {
	id: "no-x",
	files: "**/*.md",
	level: "warning",
	document: "",
	check: (text) =>
		text
			.split("\n")
			.flatMap((line, i) =>
				line.includes("x") ? [new Finding(i + 1, 1, "an x")] : [],
			),
};

describe("linter", () => {
	it("stamps path, rule, and severity onto findings", () => {
		const diagnostics = new Linter([noX]).lint([
			{ path: "docs/a.md", text: "ok\nx marks the spot" },
		]);

		expect(diagnostics).toEqual([
			{
				path: "docs/a.md",
				rule: "no-x",
				severity: "warning",
				line: 2,
				column: 1,
				message: "an x",
			},
		]);
	});

	it("skips a rule with no check: that one is an agent's job", () => {
		const agentRule: Rule = { ...noX, check: undefined };
		const linter = new Linter([agentRule]);

		expect(linter.matches("docs/a.md")).toBe(false);
		expect(linter.lint([{ path: "docs/a.md", text: "x" }])).toEqual([]);
	});

	it("only runs a rule on files its glob wants", () => {
		const diagnostics = new Linter([noX]).lint([
			{ path: "src/x.ts", text: "x everywhere x" },
		]);

		expect(diagnostics).toEqual([]);
	});

	it("tells a caller which paths matter", () => {
		const linter = new Linter([noX]);

		expect(linter.matches("docs/a.md")).toBe(true);
		expect(linter.matches("src/a.ts")).toBe(false);
	});

	it("keeps a check's own helpers reachable", () => {
		// The linter holds the rule, never a function pulled off it, so a check
		// written as a method still has its class around it.
		const diagnostics = new Linter([new Counting()]).lint([
			{ path: "a.md", text: "one\ntwo" },
		]);

		expect(diagnostics.map((d) => d.message)).toEqual(["line 1 of 2"]);
	});

	it("drops findings a lint-ignore excuses", () => {
		const diagnostics = new Linter([noX]).lint([
			{
				path: "a.md",
				text: "<!-- lint-ignore no-x: the topic is x itself -->\nx\nclean",
			},
		]);

		expect(diagnostics).toEqual([]);
	});

	it("drops every finding when the file is excused", () => {
		const diagnostics = new Linter([noX]).lint([
			{ path: "a.md", text: "x\nx\n<!-- lint-ignore-file no-x: an x demo -->" },
		]);

		expect(diagnostics).toEqual([]);
	});
});

class Counting implements Rule {
	readonly id = "counting";
	readonly files = "**/*.md";
	readonly level = "error";
	readonly document = "";

	check(text: string): Finding[] {
		return [new Finding(1, 1, `line 1 of ${this.lines(text)}`)];
	}

	private lines(text: string): number {
		return text.split("\n").length;
	}
}
