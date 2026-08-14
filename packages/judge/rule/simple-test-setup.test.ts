import { describe, expect, it } from "bun:test";
import { SimpleTestSetup } from "./simple-test-setup";

// The document says what the rule is, to a human and to an agent. What is
// here is where a finding points, and the loop shapes no document should have to teach.
describe("simple-test-setup", () => {
	it("points at a test a loop registers, wherever the loop nests", () => {
		const text = [
			"for (const c of cases) {",
			"\tif (c.slow) {",
			'\t\tit.skip("is slow", () => {});',
			"\t}",
			'\ttest("runs", () => {});',
			"}",
		].join("\n");

		expect(
			new SimpleTestSetup().check({ path: "t.ts", text: text }).findings,
		).toEqual([
			{ line: 3, column: 3, message: expect.stringContaining("loop") },
			{ line: 5, column: 2, message: expect.stringContaining("loop") },
		]);
	});

	it("allows a loop after its body closes and inside a test", () => {
		const text = [
			"for (const item of items) {",
			"\tcart.add(item);",
			"}",
			'it("totals the items added", () => {',
			"\tfor (const item of items) {",
			"\t\texpect(cart.has(item)).toBe(true);",
			"\t}",
			"});",
		].join("\n");

		expect(
			new SimpleTestSetup().check({ path: "t.ts", text: text }).findings,
		).toEqual([]);
	});

	it("ignores identifiers that only look like tests: members, strings", () => {
		const text = [
			"while (queue.length > 0) {",
			"\trunner.it();",
			'\tconst s = "it(fake)";',
			"}",
		].join("\n");

		expect(
			new SimpleTestSetup().check({ path: "t.ts", text: text }).findings,
		).toEqual([]);
	});
});
