import { describe, expect, it } from "bun:test";
import { NodeGlob } from "@webappwiz/sys";
import { Checker } from "./checker";
import { Hit } from "./hit";
import type { Checked, Rule } from "./rule/rule";

const noX: Rule = {
	id: "no-x",
	files: "**/*.md",
	level: "warning",
	checkedBy: "code",
	document: "",
	check: (text) =>
		text
			.split("\n")
			.flatMap((line, i) =>
				line.includes("x") ? [new Hit(i + 1, 1, "an x")] : [],
			),
};

describe("checker", () => {
	// the real matcher, not a fake: it is a pure predicate over two strings, so
	// standing one in would only reimplement it
	const glob = new NodeGlob();

	it("stamps path, rule, and severity onto findings", () => {
		const diagnostics = new Checker([noX], glob).check([
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
		const agentRule: Rule = {
			id: noX.id,
			files: noX.files,
			level: noX.level,
			checkedBy: "agent",
			document: noX.document,
		};
		const checker = new Checker([agentRule], glob);

		expect(checker.matches("docs/a.md")).toBe(false);
		expect(checker.check([{ path: "docs/a.md", text: "x" }])).toEqual([]);
	});

	it("only runs a rule on files its glob wants", () => {
		const diagnostics = new Checker([noX], glob).check([
			{ path: "src/x.ts", text: "x everywhere x" },
		]);

		expect(diagnostics).toEqual([]);
	});

	it("tells a caller which paths matter", () => {
		const checker = new Checker([noX], glob);

		expect(checker.matches("docs/a.md")).toBe(true);
		expect(checker.matches("src/a.ts")).toBe(false);
	});

	it("keeps a check's own helpers reachable", () => {
		// The checker holds the rule, never a function pulled off it, so a check
		// written as a method still has its class around it.
		const diagnostics = new Checker([new Counting()], glob).check([
			{ path: "a.md", text: "one\ntwo" },
		]);

		expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
			"line 1 of 2",
		]);
	});

	it("drops findings a judge-ignore excuses", () => {
		const diagnostics = new Checker([noX], glob).check([
			{
				path: "a.md",
				text: "<!-- judge-ignore no-x: the topic is x itself -->\nx\nclean",
			},
		]);

		expect(diagnostics).toEqual([]);
	});

	it("drops every finding when the file is excused", () => {
		const diagnostics = new Checker([noX], glob).check([
			{
				path: "a.md",
				text: "x\nx\n<!-- judge-ignore-file no-x: an x demo -->",
			},
		]);

		expect(diagnostics).toEqual([]);
	});
});

class Counting implements Checked {
	readonly id = "counting";
	readonly files = "**/*.md";
	readonly level = "error";
	readonly checkedBy = "code";
	readonly document = "";

	check(text: string): Hit[] {
		return [new Hit(1, 1, `line 1 of ${this.lines(text)}`)];
	}

	private lines(text: string): number {
		return text.split("\n").length;
	}
}
