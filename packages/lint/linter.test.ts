import { describe, expect, it } from "bun:test";
import { Linter } from "./linter";
import type { Rule } from "./rule";

const noX: Rule = {
	name: "No x",
	id: "no-x",
	path: "no-x.md",
	files: "**/*.md",
	level: "warning",
	description: "",
	good: [],
	bad: [],
	text: "",
	check: (text) =>
		text
			.split("\n")
			.flatMap((line, i) =>
				line.includes("x") ? [{ line: i + 1, column: 1, message: "an x" }] : [],
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
