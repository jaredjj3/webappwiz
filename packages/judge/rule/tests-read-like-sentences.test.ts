import { describe, expect, it } from "bun:test";
import { TestsReadLikeSentences } from "./tests-read-like-sentences";

// The document says what the rule is, to a human and to an agent. What is
// here is where a finding points, and the call forms no document should have to teach.
describe("tests-read-like-sentences", () => {
	it("points at each describe after the first", () => {
		const text = [
			'describe("a", () => {});',
			'describe("b", () => {});',
			'describe("c", () => {});',
		].join("\n");

		expect(new TestsReadLikeSentences().check(text)).toEqual([
			{ line: 2, column: 1, message: expect.stringContaining("exactly one") },
			{ line: 3, column: 1, message: expect.stringContaining("exactly one") },
		]);
	});

	it("counts a modified call like describe.concurrent as the one describe", () => {
		const one = 'describe.concurrent("a", () => {});';
		const two = `${one}\ndescribe("b", () => {});`;

		expect(new TestsReadLikeSentences().check(one)).toEqual([]);
		expect(new TestsReadLikeSentences().check(two)).toHaveLength(1);
	});

	it("ignores describe outside a call: imports, members, strings", () => {
		const text = [
			'import { describe, it } from "bun:test";',
			'const s = "describe(fake)";',
			"suite.describe();",
			'describe("real", () => {});',
		].join("\n");

		expect(new TestsReadLikeSentences().check(text)).toEqual([]);
	});
});
