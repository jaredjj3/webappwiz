import { describe, expect, it } from "bun:test";
import { NoEmDashes } from "./no-em-dashes";

// The document's examples are the rest of this rule's suite: judge.config.test.ts
// runs every Good and Bad block through the check. What is left here is where a
// finding points, and which of the two messages it carries.
describe("no-em-dashes", () => {
	it("points at the dash, on the line it sits on", () => {
		expect(new NoEmDashes().check("clean\nclean\nnot \u2014 clean")).toEqual([
			{ line: 3, column: 5, message: expect.stringContaining("em dash") },
		]);
	});

	it("tells an en dash between words from an em dash", () => {
		const findings = new NoEmDashes().check("before \u2013 after");

		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain("en dash between words");
	});
});
