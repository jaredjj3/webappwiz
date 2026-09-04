import { describe, expect, it } from "bun:test";
import { NodeGlob } from "webappwiz/system";
import { Rule, RuleError } from "./rule";
import { ruleDoc } from "./testing";

describe("Rule", () => {
	it("reads every field a review needs out of the frontmatter", () => {
		const rule = Rule.parse(
			ruleDoc("no-foo", {
				description: "No foo.",
				files: "**/*.tsx",
				level: "warning",
				complexity: "high",
				hints: "grep for foo",
				version: "1.2.3",
			}),
		);

		expect(rule).toMatchObject({
			id: "no-foo",
			description: "No foo.",
			files: "**/*.tsx",
			level: "warning",
			complexity: "high",
			hints: "grep for foo",
			version: "1.2.3",
		});
	});

	it("keeps the whole document verbatim", () => {
		const doc = ruleDoc("no-foo");

		expect(Rule.parse(doc).document).toEqual(doc);
	});

	it("applies to every file when the frontmatter names no glob", () => {
		const doc = ruleDoc("no-foo").replace(/^files:.*\n/m, "");

		expect(Rule.parse(doc).files).toEqual("**/*");
	});

	it("has no hints and no version when the frontmatter has none", () => {
		const rule = Rule.parse(ruleDoc("no-foo"));

		expect(rule.hints).toBeUndefined();
		expect(rule.version).toBeNull();
	});

	it("treats an empty hints line as no hints", () => {
		const rule = Rule.parse(ruleDoc("no-foo", { hints: "" }));

		expect(rule.hints).toBeUndefined();
	});

	it("rejects a document with no frontmatter, at line 1", () => {
		expect(() => Rule.parse("# No foo\n\n## Good\n\n## Bad\n")).toThrow(
			new RuleError("RULE.md:1: no frontmatter: a rule opens with a --- block"),
		);
	});

	it("names the missing field and the file it was reading", () => {
		const doc = ruleDoc("no-foo").replace(/^level:.*\n/m, "");

		expect(() =>
			Rule.parse(doc, { path: ".wiz/rules/no-foo/RULE.md" }),
		).toThrow(/^\.wiz\/rules\/no-foo\/RULE\.md:1: level: /);
	});

	it("points a bad value at its line", () => {
		const doc = ruleDoc("no-foo").replace(
			"complexity: medium",
			"complexity: hard",
		);

		expect(() => Rule.parse(doc)).toThrow(/^RULE\.md:6: complexity: /);
	});

	it("rejects a name that is not kebab case", () => {
		const doc = ruleDoc("no-foo").replace("name: no-foo", "name: No_Foo");

		expect(() => Rule.parse(doc)).toThrow(
			new RuleError('RULE.md:2: name: "No_Foo" is not kebab case'),
		);
	});

	it("rejects a name that is not its directory's", () => {
		expect(() => Rule.parse(ruleDoc("no-foo"), { id: "no-bar" })).toThrow(
			new RuleError(
				'RULE.md:2: name: "no-foo" does not match its directory "no-bar"',
			),
		);
	});

	it("requires a title", () => {
		const doc = ruleDoc("no-foo").replace("# no-foo\n", "");

		expect(() => Rule.parse(doc)).toThrow(
			new RuleError("RULE.md:7: no title: add a `# ` heading"),
		);
	});

	it("requires the Good and Bad sections, and says which is missing", () => {
		const doc = ruleDoc("no-foo").replace("## Bad", "## Worse");

		expect(() => Rule.parse(doc)).toThrow(
			new RuleError("RULE.md:9: no `## Bad` section"),
		);
	});

	it("does not take a deeper heading for a section", () => {
		const doc = ruleDoc("no-foo").replace("## Good", "### Good");

		expect(() => Rule.parse(doc)).toThrow(/no `## Good` section/);
	});

	it("matches a file by its glob", () => {
		const rule = Rule.parse(ruleDoc("no-foo", { files: "**/*.test.ts" }));
		const glob = new NodeGlob();

		expect(rule.matches("src/a.test.ts", glob)).toBe(true);
		expect(rule.matches("src/a.ts", glob)).toBe(false);
	});
});
