import { describe, expect, it } from "bun:test";
import { ClassesOverFunctionExports } from "./classes-over-function-exports";

const classesOverFunctionExports = new ClassesOverFunctionExports();

describe("classes-over-function-exports", () => {
	it("accepts pure helpers sharing a file", () => {
		const text = [
			"export function a(s: string): string { return s; }",
			"export function b(n: number): number { return n; }",
		].join("\n");

		expect(classesOverFunctionExports.check(text)).toEqual([]);
	});

	it("accepts one function that injects, next to pure helpers", () => {
		const text = [
			"export function stamp(m: string, now: () => Date): string {",
			"\treturn now().toISOString() + m;",
			"}",
			"export function trimmed(m: string): string { return m.trim(); }",
		].join("\n");

		expect(classesOverFunctionExports.check(text)).toEqual([]);
	});

	it("flags the second exported function that injects", () => {
		const text = [
			"export function stamp(m: string, now: () => Date): string {",
			"\treturn now().toISOString() + m;",
			"}",
			"export async function stampAll(ms: string[], now: () => Date) {",
			"\treturn ms.map((m) => stamp(m, now));",
			"}",
		].join("\n");

		expect(classesOverFunctionExports.check(text)).toEqual([
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

		expect(classesOverFunctionExports.check(text)).toEqual([]);
	});

	it("leaves non-exported functions alone", () => {
		const text = [
			"function a(now: () => Date) { return now(); }",
			"function b(now: () => Date) { return now(); }",
		].join("\n");

		expect(classesOverFunctionExports.check(text)).toEqual([]);
	});
});
