import { describe, expect, it } from "bun:test";
import { MarkdownWriter } from "@webappwiz/md";
import { checkGuide, compile, type Rule } from "./rule";

const good = new MarkdownWriter()
	.field("files", "**/*.ts")
	.heading(1, "Single class per file")
	.text("Each file exports at most one class.")
	.heading(2, "Good")
	.code("ts", "class Foo {}")
	.heading(2, "Bad")
	.code("ts", "class Foo {}\nclass Bar {}")
	.toString();

describe("compile", () => {
	it("compiles a sound rule with no diagnostics", () => {
		const { rule, diagnostics } = compile(good, "r.md");

		expect(diagnostics).toEqual([]);
		expect(rule).toEqual({
			name: "Single class per file",
			path: "r.md",
			files: "**/*.ts",
			description: "Each file exports at most one class.",
			good: ["class Foo {}"],
			bad: ["class Foo {}\nclass Bar {}"],
			text: good,
		});
	});

	it("errors on a rule missing everything, all at once", () => {
		const { rule, diagnostics } = compile("just prose\n", "r.md");

		expect(rule).toBeNull();
		expect(diagnostics.map((d) => `${d.severity}: ${d.message}`)).toEqual([
			'error: missing "files" glob in frontmatter',
			"error: missing title (# heading)",
			"error: no ## Good section",
			"warning: no ## Bad section",
		]);
	});

	it("errors when Good has prose but no fence", () => {
		const text = good.replace("```ts\nclass Foo {}\n```", "just words");

		const { rule, diagnostics } = compile(text, "r.md");

		expect(rule).toBeNull();
		expect(diagnostics).toContainEqual({
			path: "r.md",
			line: 9,
			severity: "error",
			message: "## Good section has no fenced code block",
		});
	});

	it("compiles without Bad, but says so", () => {
		const text = good.split("\n## Bad")[0] ?? "";

		const { rule, diagnostics } = compile(text, "r.md");

		expect(rule?.bad).toEqual([]);
		expect(diagnostics).toEqual([
			{ path: "r.md", severity: "warning", message: "no ## Bad section" },
		]);
	});

	it("warns on unknown sections, missing description, untagged fences", () => {
		const text = new MarkdownWriter()
			.field("files", "**/*.ts")
			.heading(1, "Terse")
			.heading(2, "Good")
			.code("", "x")
			.heading(2, "Bad")
			.code("ts", "y")
			.heading(2, "Notes")
			.text("hm")
			.toString();

		const { rule, diagnostics } = compile(text, "r.md");

		expect(rule).not.toBeNull();
		expect(diagnostics.map((d) => `${d.line}: ${d.message}`)).toEqual([
			"5: no description under the title",
			'19: unrecognized section "## Notes"',
			'7: fenced block in "Good" has no language tag',
		]);
	});
});

describe("checkGuide", () => {
	const rule = (name: string, path: string): Rule => ({
		name,
		path,
		files: "**",
		description: "",
		good: [],
		bad: [],
		text: "",
	});

	it("errors on duplicate names, pointing at both files", () => {
		const diagnostics = checkGuide([
			rule("A", "a.md"),
			rule("B", "b.md"),
			rule("A", "c.md"),
		]);

		expect(diagnostics).toEqual([
			{
				path: "c.md",
				severity: "error",
				message: 'duplicate rule name "A" (also a.md)',
			},
		]);
	});

	it("is quiet when names are unique", () => {
		expect(checkGuide([rule("A", "a.md"), rule("B", "b.md")])).toEqual([]);
	});
});
