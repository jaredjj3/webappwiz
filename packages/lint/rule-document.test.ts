import { describe, expect, it } from "bun:test";
import { MarkdownWriter } from "@webappwiz/md";
import { RuleDocument } from "./rule-document";
import { testRule } from "./testing";

const good = new MarkdownWriter()
	.heading(1, "Single class per file")
	.text("Each file exports at most one class.")
	.heading(2, "Good")
	.code("ts", "class Foo {}")
	.heading(2, "Bad")
	.code("ts", "class Foo {}\nclass Bar {}")
	.toString();

const documented = (document: string) =>
	new RuleDocument(testRule("one-class", { document }));

describe("RuleDocument", () => {
	it("reads the title, description and examples of a sound document", () => {
		const doc = documented(good);

		expect(doc.diagnostics()).toEqual([]);
		expect(doc.title).toBe("Single class per file");
		expect(doc.description).toBe("Each file exports at most one class.");
		expect(doc.good).toEqual(["class Foo {}"]);
		expect(doc.bad).toEqual(["class Foo {}\nclass Bar {}"]);
	});

	it("answers with the rule's id while the document has no title", () => {
		const doc = documented(good.replace("# Single class per file\n", ""));

		expect(doc.title).toBe("one-class");
		expect(doc.diagnostics()).toEqual([
			{
				rule: "one-class",
				line: undefined,
				severity: "error",
				message: "missing title (# heading)",
			},
		]);
	});

	it("errors on a document with no examples to check against", () => {
		const doc = documented(good.replace(/## Good[\s\S]*?## Bad/, "## Bad"));

		expect(doc.good).toEqual([]);
		expect(doc.diagnostics()).toEqual([
			{
				rule: "one-class",
				line: undefined,
				severity: "error",
				message: "no ## Good section",
			},
		]);
	});

	it("errors on a section holding no fenced code", () => {
		const doc = documented(
			new MarkdownWriter()
				.heading(1, "Title")
				.text("Prose.")
				.heading(2, "Good")
				.text("described but not shown")
				.heading(2, "Bad")
				.code("ts", "class Foo {}\nclass Bar {}")
				.toString(),
		);

		expect(doc.diagnostics()).toEqual([
			{
				rule: "one-class",
				line: 5,
				severity: "error",
				message: "## Good section has no fenced code block",
			},
		]);
	});

	it("warns about a missing Bad section, which not every rule can show", () => {
		const doc = documented(good.replace(/## Bad[\s\S]*/, ""));

		expect(doc.diagnostics()).toEqual([
			{
				rule: "one-class",
				line: undefined,
				severity: "warning",
				message: "no ## Bad section",
			},
		]);
	});

	it("warns about a section an agent would not know to read", () => {
		const doc = documented(`${good}\n## Notes\n\nAn aside.\n`);

		expect(doc.diagnostics()).toEqual([
			{
				rule: "one-class",
				line: 18,
				severity: "warning",
				message: 'unrecognized section "## Notes"',
			},
		]);
	});

	it("warns about a fence with no language for an agent to read", () => {
		const doc = documented(
			good.replace("```ts\nclass Foo {}", "```\nclass Foo {}"),
		);

		expect(doc.diagnostics()).toEqual([
			{
				rule: "one-class",
				line: 5,
				severity: "warning",
				message: 'fenced block in "Good" has no language tag',
			},
		]);
	});

	it("warns about a title with no prose under it", () => {
		const doc = documented(
			good.replace("Each file exports at most one class.\n\n", ""),
		);

		expect(doc.diagnostics()).toEqual([
			{
				rule: "one-class",
				line: 1,
				severity: "warning",
				message: "no description under the title",
			},
		]);
	});
});
