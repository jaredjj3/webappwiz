import { describe, expect, it } from "bun:test";
import { Rule, RuleError } from "./rule";
import { ruleDoc } from "./testing";

describe("Rule", () => {
	it("reads every field a review needs out of the frontmatter", () => {
		const rule = Rule.parse(
			ruleDoc("no-foo", {
				description: "No foo.",
				files: "**/*.tsx",
				level: "warning",
				recommended: true,
				version: "1.2.3",
			}),
		);

		expect(rule).toMatchObject({
			id: "no-foo",
			description: "No foo.",
			files: "**/*.tsx",
			level: "warning",
			recommended: true,
			version: "1.2.3",
		});
	});

	it("recommends a rule only when its frontmatter says so", () => {
		expect(Rule.parse(ruleDoc("no-foo")).recommended).toBe(false);
		expect(
			Rule.parse(ruleDoc("no-foo", { recommended: false })).recommended,
		).toBe(false);
	});

	it("rejects a recommended that is neither true nor false", () => {
		const doc = ruleDoc("no-foo", { recommended: true }).replace(
			"recommended: true",
			"recommended: yes",
		);

		expect(() => Rule.parse(doc)).toThrow(
			/^RULE\.md:6: recommended: expected one of true, false/,
		);
	});

	it("keeps the whole document verbatim", () => {
		const doc = ruleDoc("no-foo");

		expect(Rule.parse(doc).document).toEqual(doc);
	});

	it("applies to every file when the frontmatter names no glob", () => {
		const doc = ruleDoc("no-foo").replace(/^files:.*\n/m, "");

		expect(Rule.parse(doc).files).toEqual("**/*");
	});

	it("has no version when the frontmatter has none", () => {
		expect(Rule.parse(ruleDoc("no-foo")).version).toBeNull();
	});

	it("rejects a document with no frontmatter, at line 1", () => {
		expect(() => Rule.parse("# No foo\n")).toThrow(
			new RuleError("RULE.md:1: no frontmatter: a rule opens with a --- block"),
		);
	});

	it("names the missing field and the file it was reading", () => {
		const doc = ruleDoc("no-foo").replace(/^description:.*\n/m, "");

		expect(() => Rule.parse(doc, { path: ".wiz/scry/no-foo/RULE.md" })).toThrow(
			/^\.wiz\/scry\/no-foo\/RULE\.md:1: description: /,
		);
	});

	it("points a bad value at its line", () => {
		const doc = ruleDoc("no-foo").replace("level: error", "level: loud");

		expect(() => Rule.parse(doc)).toThrow(
			/^RULE\.md:5: level: expected one of error, warning/,
		);
	});

	it("reports as an error when the frontmatter names no level", () => {
		const doc = ruleDoc("no-foo", { level: "warning" }).replace(
			/^level:.*\n/m,
			"",
		);

		expect(Rule.parse(doc).level).toEqual("error");
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

	it("leaves the body to its author, the way a skill's is", () => {
		const doc = "---\nname: no-foo\ndescription: x\n---\n";

		expect(Rule.parse(doc).id).toEqual("no-foo");
	});

	it("takes medium effort when the frontmatter names none", () => {
		expect(Rule.parse(ruleDoc("no-foo")).effort).toEqual("medium");
		expect(Rule.parse(ruleDoc("no-foo", { effort: "low" })).effort).toEqual(
			"low",
		);
	});

	it("rejects effort none for a rule with no scripts to decide it", () => {
		expect(() => Rule.parse(ruleDoc("no-foo", { effort: "none" }))).toThrow(
			/^RULE\.md:6: effort: none means its scripts decide it/,
		);
	});

	it("keeps its scripts in name order", () => {
		const rule = Rule.parse(ruleDoc("no-foo", { effort: "none" }), {
			scripts: ["s/b.sh", "s/a.sh"],
		});

		expect(rule.scripts).toEqual(["s/a.sh", "s/b.sh"]);
	});
});
