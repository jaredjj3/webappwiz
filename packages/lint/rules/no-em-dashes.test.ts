import { describe, expect, it } from "bun:test";
import { noEmDashes } from "./no-em-dashes";

describe("no-em-dashes", () => {
	it("flags an em dash where it sits", () => {
		expect(noEmDashes.check("stderr \u2014 keep it parseable")).toEqual([
			{
				line: 1,
				column: 8,
				message: "em dash: use a colon, comma, parentheses, or a full stop",
			},
		]);
	});

	it("flags an en dash between words", () => {
		const findings = noEmDashes.check("before \u2013 after");

		expect(findings).toHaveLength(1);
		expect(findings[0]?.message).toContain("en dash between words");
	});

	it("keeps the en dash of a digit range", () => {
		expect(noEmDashes.check("retry in 5\u201310 seconds")).toEqual([]);
	});

	it("reports the line a later dash sits on", () => {
		expect(noEmDashes.check("clean\nclean\nnot \u2014 clean")).toEqual([
			{ line: 3, column: 5, message: expect.stringContaining("em dash") },
		]);
	});
});
