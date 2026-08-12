import { describe, expect, it } from "bun:test";
import { Markdown, MarkdownError } from "./markdown";
import { MarkdownWriter } from "./writer";

const doc = new MarkdownWriter()
	.field("files", "**/*.ts")
	.field("version", "1.2.3")
	.heading(1, "Single class per file")
	.text("Each file exports at most one class.")
	.heading(2, "Good")
	.text("One class, one file.")
	.code("ts", "class Foo {}")
	.heading(3, "Variant")
	.code("ts", "export default class Foo {}")
	.heading(2, "Bad")
	.code("", "class Foo {}\nclass Bar {}")
	.toString();

describe("Markdown", () => {
	it("parses flat frontmatter fields", () => {
		const md = Markdown.parse(doc);

		expect(md.fields).toEqual({ files: "**/*.ts", version: "1.2.3" });
		expect(md.field("version")).toBe("1.2.3");
	});

	it("unquotes quoted field values, as YAML would", () => {
		const md = Markdown.parse('---\nfiles: "**/*.ts"\n---\n');

		expect(md.field("files")).toBe("**/*.ts");
	});

	it("throws on a missing field, naming the ones there are", () => {
		expect(() => Markdown.parse(doc).field("nope")).toThrow(
			new MarkdownError('no field "nope" (have: files, version)'),
		);
	});

	it("has no fields without frontmatter", () => {
		const md = Markdown.parse("# Hi\n");

		expect(md.fields).toEqual({});
		expect(md.body).toBe("# Hi\n");
	});

	it("does not mistake a --- ruler mid-document for frontmatter", () => {
		expect(Markdown.parse("intro\n---\nfake: no\n---\n").fields).toEqual({});
	});

	it("finds the title", () => {
		expect(Markdown.parse(doc).title).toBe("Single class per file");
		expect(Markdown.parse("no headings").title).toBeNull();
	});

	it("scopes a section to the next heading of its level", () => {
		const good = Markdown.parse(doc).section("Good");

		expect(good.level).toBe(2);
		expect(good.body).toContain("### Variant");
		expect(good.body).not.toContain("## Bad");
	});

	it("stops a section's lead at the first subsection", () => {
		const good = Markdown.parse(doc).section("Good");

		expect(good.lead).toBe("One class, one file.\n\n```ts\nclass Foo {}\n```");
	});

	it("matches headings case-insensitively", () => {
		expect(Markdown.parse(doc).section("good").heading).toBe("Good");
		expect(Markdown.parse(doc).has("BAD")).toBe(true);
	});

	it("throws on a missing section, naming the ones there are", () => {
		expect(() => Markdown.parse("# A\n## B\n").section("C")).toThrow(
			new MarkdownError('no section "C" (have: A, B)'),
		);
	});

	it("ignores headings inside code fences", () => {
		const md = Markdown.parse("# A\n```md\n# not a heading\n```\n");

		expect(md.sections.map((section) => section.heading)).toEqual(["A"]);
	});

	it("carries source line numbers through frontmatter", () => {
		// 4 frontmatter lines, a blank, then the title
		expect(Markdown.parse(doc).section("Single class per file").line).toBe(6);
		expect(Markdown.parse(doc).section("Good").line).toBe(10);
	});

	it("collects code fences with and without a language", () => {
		const md = Markdown.parse(doc);

		expect(md.section("Good").codeBlocks()).toEqual([
			{ lang: "ts", code: "class Foo {}" },
			{ lang: "ts", code: "export default class Foo {}" },
		]);
		expect(md.section("Bad").codeBlocks()).toEqual([
			{ lang: "", code: "class Foo {}\nclass Bar {}" },
		]);
	});

	it("scopes code blocks to the lead when asked", () => {
		expect(Markdown.parse(doc).section("Good").codeBlocks("lead")).toEqual([
			{ lang: "ts", code: "class Foo {}" },
		]);
	});

	it("keeps backtick content inside a tilde fence", () => {
		const md = Markdown.parse("# A\n~~~md\n```ts\nx\n```\n~~~\n");

		expect(md.section("A").codeBlocks()).toEqual([
			{ lang: "md", code: "```ts\nx\n```" },
		]);
	});
});
