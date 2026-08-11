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

const stub = (name: string, path: string): Rule => ({
	name,
	id: path.replace(".md", ""),
	path,
	files: "**",
	level: "error",
	description: "",
	good: [],
	bad: [],
	text: "",
});

describe("rule", () => {
	it("compiles a sound rule with no diagnostics", () => {
		const { rule, diagnostics } = compile(good, "r.md");

		expect(diagnostics).toEqual([]);
		expect(rule).toEqual({
			name: "Single class per file",
			id: "r",
			path: "r.md",
			files: "**/*.ts",
			level: "error",
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

	it("warns on unknown sections, missing descriptions, and untagged fences", () => {
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

	it("carries an attached check and its partial flag onto the rule", () => {
		const check = () => [];

		const { rule } = compile(good, "r.md", { check, partial: true });

		expect(rule?.check).toBe(check);
		expect(rule?.partial).toBe(true);
	});

	it("errors on partial without a check", () => {
		const { rule, diagnostics } = compile(good, "r.md", { partial: true });

		expect(rule).toBeNull();
		expect(diagnostics[0]?.message).toContain("partial without a check");
	});

	it("takes the id from the file name, so a report can cite it", () => {
		expect(compile(good, "rules/single-class-per-file.md").rule?.id).toBe(
			"single-class-per-file",
		);
	});

	it("takes the level from frontmatter when the rule sets one", () => {
		const text = good.replace("files:", "level: warning\nfiles:");

		expect(compile(text, "r.md").rule?.level).toBe("warning");
	});

	it("errors on a level that is neither error nor warning", () => {
		const text = good.replace("files:", "level: nit\nfiles:");

		const { rule, diagnostics } = compile(text, "r.md");

		expect(rule).toBeNull();
		expect(diagnostics[0]?.message).toBe(
			'level must be "error" or "warning", not "nit"',
		);
	});

	it("finds duplicate rule names across a guide, pointing at both files", () => {
		const diagnostics = checkGuide([
			stub("A", "a.md"),
			stub("B", "b.md"),
			stub("A", "c.md"),
		]);

		expect(diagnostics).toEqual([
			{
				path: "c.md",
				severity: "error",
				message: 'duplicate rule name "A" (also a.md)',
			},
		]);
	});

	it("stays quiet when rule names are unique", () => {
		expect(checkGuide([stub("A", "a.md"), stub("B", "b.md")])).toEqual([]);
	});
});
