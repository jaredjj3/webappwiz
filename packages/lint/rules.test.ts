import { describe, expect, it } from "bun:test";
import {
	classesOverFunctionExports,
	noEmDashes,
	oneClassPerFile,
} from "./rules";

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

describe("one-class-per-file", () => {
	it("accepts a lone class", () => {
		expect(oneClassPerFile.check("export class A {}\n")).toEqual([]);
	});

	it("flags the second top-level class", () => {
		const findings = oneClassPerFile.check("class A {}\n\nexport class B {}\n");

		expect(findings).toEqual([
			{ line: 3, column: 8, message: expect.stringContaining("own file") },
		]);
	});

	it("ignores nested and expression classes", () => {
		const text = [
			"const A = class {};",
			"export class B {",
			"\tinner() {",
			"\t\treturn class {};",
			"\t}",
			"}",
		].join("\n");

		expect(oneClassPerFile.check(text)).toEqual([]);
	});

	it("is not fooled by classes in comments or strings", () => {
		const text = [
			"// class A {}",
			'const s = "class B {}";',
			// biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is source text
			"const t = `class C ${1} {}`;",
			"export class D {}",
		].join("\n");

		expect(oneClassPerFile.check(text)).toEqual([]);
	});

	it("keeps counting top-level classes after a template substitution", () => {
		const text = [
			// biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is source text
			"const s = `a${1}b`;",
			"class A {}",
			"class B {}",
		].join("\n");

		expect(oneClassPerFile.check(text)).toEqual([
			{ line: 3, column: 1, message: expect.stringContaining("own file") },
		]);
	});
});

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
