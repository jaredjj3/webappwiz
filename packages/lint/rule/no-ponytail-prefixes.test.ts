// lint-ignore-file no-ponytail-prefixes: the fixtures carry the prefix on purpose
import { describe, expect, it } from "bun:test";
import { NoPonytailPrefixes } from "./no-ponytail-prefixes";

// The document's examples are the rest of this rule's suite: recommended.test.ts
// runs every Good and Bad block through the check. What is left here is where a
// finding points, and the comment shapes the document does not show.
describe("no-ponytail-prefixes", () => {
	it("points at the prefix rather than the comment opening it", () => {
		expect(
			new NoPonytailPrefixes().check("const x = 1; // ponytail: later"),
		).toEqual([
			{ line: 1, column: 17, message: expect.stringContaining("ponytail") },
		]);
	});

	it("finds the prefix in a block comment and on a doc comment's line", () => {
		const text = "/* ponytail: x */\n/**\n * ponytail: y\n */";

		expect(new NoPonytailPrefixes().check(text).map((f) => f.line)).toEqual([
			1, 3,
		]);
	});

	it("leaves a comment that mentions the tag mid sentence alone", () => {
		expect(
			new NoPonytailPrefixes().check("// the ponytail: tag means nothing here"),
		).toEqual([]);
	});
});
