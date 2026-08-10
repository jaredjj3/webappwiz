import { describe, expect, it } from "bun:test";
import { MarkdownWriter } from "./writer";

describe("MarkdownWriter", () => {
	it("writes frontmatter first, blocks in order, one blank line apart", () => {
		const text = new MarkdownWriter()
			.heading(1, "T")
			.text("prose")
			.field("a", "1") // late — still lands in the frontmatter
			.toString();

		expect(text).toBe("---\na: 1\n---\n\n# T\n\nprose\n");
	});

	it("outfences backticks in the code", () => {
		const text = new MarkdownWriter().code("md", "```ts\nx\n```").toString();

		expect(text).toBe("````md\n```ts\nx\n```\n````\n");
	});

	it("round-trips through parse", () => {
		const md = new MarkdownWriter()
			.field("files", "**/*.ts")
			.heading(1, "T")
			.heading(2, "Good")
			.code("ts", "class Foo {}")
			.toMarkdown();

		expect(md.field("files")).toBe("**/*.ts");
		expect(md.title).toBe("T");
		expect(md.section("Good").codeBlocks()).toEqual([
			{ lang: "ts", code: "class Foo {}" },
		]);
	});
});
