import { describe, expect, it } from "bun:test";
import { ClassesOverFunctionExports } from "./classes-over-function-exports";

// The document's examples are the rest of this rule's suite: judge.config.test.ts
// runs every Good block through the check. What is left here is where a finding
// points, and the token edges no document should have to teach.
describe("classes-over-function-exports", () => {
	it("points at the second exported function that injects", () => {
		const text = [
			"export function stamp(m: string, now: () => Date): string {",
			"\treturn now().toISOString() + m;",
			"}",
			"export async function stampAll(ms: string[], now: () => Date) {",
			"\treturn ms.map((m) => stamp(m, now));",
			"}",
		].join("\n");

		expect(new ClassesOverFunctionExports().check(text)).toEqual([
			{
				line: 4,
				column: 14,
				message: expect.stringContaining("group them into a class"),
			},
		]);
	});

	it("does not mistake a returned arrow for an injected one", () => {
		const text = [
			"export function make(s: string): () => string {",
			"\treturn () => s;",
			"}",
			"export function keep(s: string): () => string {",
			"\treturn () => s;",
			"}",
		].join("\n");

		expect(new ClassesOverFunctionExports().check(text)).toEqual([]);
	});

	it("leaves non-exported functions alone", () => {
		const text = [
			"function a(now: () => Date) { return now(); }",
			"function b(now: () => Date) { return now(); }",
		].join("\n");

		expect(new ClassesOverFunctionExports().check(text)).toEqual([]);
	});
});
