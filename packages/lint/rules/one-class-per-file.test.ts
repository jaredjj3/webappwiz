import { describe, expect, it } from "bun:test";
import { oneClassPerFile } from "./one-class-per-file";

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
