import { describe, expect, it } from "bun:test";
import { NoEmDashes } from "./no-em-dashes";

// The document says what the rule is, to a human and to an agent. What is
// here is where a finding points, and which of the two messages it carries.
describe("no-em-dashes", () => {
	it("points at the dash, on the line it sits on", () => {
		expect(
			new NoEmDashes().check({
				path: "t.ts",
				text: "clean\nclean\nnot \u2014 clean",
			}).findings,
		).toEqual([
			{ line: 3, column: 5, message: expect.stringContaining("em dash") },
		]);
	});

	it("tells an en dash between words from an em dash", () => {
		const findings = new NoEmDashes().check({
			path: "t.ts",
			text: "before \u2013 after",
		}).findings;

		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain("en dash between words");
	});
});
