import { describe, expect, it } from "bun:test";
import { RuleDocument, RuleError } from "./rule-document";
import { ruleDoc } from "./testing";

describe("RuleDocument", () => {
	it("reads every field a review needs out of the frontmatter", () => {
		const rule = RuleDocument.parse(
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
		expect(RuleDocument.parse(ruleDoc("no-foo")).recommended).toBe(false);
		expect(
			RuleDocument.parse(ruleDoc("no-foo", { recommended: false })).recommended,
		).toBe(false);
	});

	it("rejects a recommended that is neither true nor false", () => {
		const doc = ruleDoc("no-foo", { recommended: true }).replace(
			"recommended: true",
			"recommended: yes",
		);

		expect(() => RuleDocument.parse(doc)).toThrow(
			/^RULE\.md:6: recommended: expected one of true, false/,
		);
	});

	it("reports at a probability of 0.7 unless the frontmatter sets a threshold", () => {
		expect(RuleDocument.parse(ruleDoc("no-foo")).threshold).toEqual(0.7);
		expect(
			RuleDocument.parse(ruleDoc("no-foo", { threshold: 0.8 })).threshold,
		).toEqual(0.8);
	});

	it("rejects a threshold outside 0 to 1", () => {
		for (const threshold of ["1.5", "high"]) {
			const doc = ruleDoc("no-foo", { threshold: 0.8 }).replace(
				"threshold: 0.8",
				`threshold: ${threshold}`,
			);

			expect(() => RuleDocument.parse(doc)).toThrow(
				/^RULE\.md:6: threshold: expected a number from 0 to 1/,
			);
		}
	});

	it("keeps the whole document verbatim", () => {
		const doc = ruleDoc("no-foo");

		expect(RuleDocument.parse(doc).document).toEqual(doc);
	});

	it("applies to every file when the frontmatter names no glob", () => {
		const doc = ruleDoc("no-foo").replace(/^files:.*\n/m, "");

		expect(RuleDocument.parse(doc).files).toEqual("**/*");
	});

	it("has no version when the frontmatter has none", () => {
		expect(RuleDocument.parse(ruleDoc("no-foo")).version).toBeNull();
	});

	it("rejects a document with no frontmatter, at line 1", () => {
		expect(() => RuleDocument.parse("# No foo\n")).toThrow(
			new RuleError("RULE.md:1: no frontmatter: a rule opens with a --- block"),
		);
	});

	it("names the missing field and the file it was reading", () => {
		const doc = ruleDoc("no-foo").replace(/^description:.*\n/m, "");

		expect(() =>
			RuleDocument.parse(doc, { path: ".wiz/scry/no-foo/RULE.md" }),
		).toThrow(/^\.wiz\/scry\/no-foo\/RULE\.md:1: description: /);
	});

	it("points a bad value at its line", () => {
		const doc = ruleDoc("no-foo").replace("level: error", "level: loud");

		expect(() => RuleDocument.parse(doc)).toThrow(
			/^RULE\.md:5: level: expected one of error, warning/,
		);
	});

	it("reports as an error when the frontmatter names no level", () => {
		const doc = ruleDoc("no-foo", { level: "warning" }).replace(
			/^level:.*\n/m,
			"",
		);

		expect(RuleDocument.parse(doc).level).toEqual("error");
	});

	it("rejects a name that is not kebab case", () => {
		const doc = ruleDoc("no-foo").replace("name: no-foo", "name: No_Foo");

		expect(() => RuleDocument.parse(doc)).toThrow(
			new RuleError('RULE.md:2: name: "No_Foo" is not kebab case'),
		);
	});

	it("rejects a name that is not its directory's", () => {
		expect(() =>
			RuleDocument.parse(ruleDoc("no-foo"), { id: "no-bar" }),
		).toThrow(
			new RuleError(
				'RULE.md:2: name: "no-foo" does not match its directory "no-bar"',
			),
		);
	});

	it("leaves the body to its author, the way a skill's is", () => {
		const doc = "---\nname: no-foo\ndescription: x\n---\n";

		expect(RuleDocument.parse(doc).id).toEqual("no-foo");
	});

	it("ignores an effort, which rules no longer take", () => {
		const doc = ruleDoc("no-foo").replace(
			"level: error",
			"level: error\neffort: high",
		);

		expect(RuleDocument.parse(doc).id).toEqual("no-foo");
	});
});
