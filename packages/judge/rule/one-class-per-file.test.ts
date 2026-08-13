import { describe, expect, it } from "bun:test";
import { OneClassPerFile } from "./one-class-per-file";

// The document's examples are the rest of this rule's suite: recommended.test.ts
// runs every Good and Bad block through the check. What is left here is where a
// finding points, and the scanner edges no document should have to teach.
describe("one-class-per-file", () => {
	it("points at the second class, not the first", () => {
		const findings = new OneClassPerFile().check(
			"class A {}\n\nexport class B {}\n",
		);

		expect(findings).toEqual([
			{ line: 3, column: 8, message: expect.stringContaining("own file") },
		]);
	});

	it("is not fooled by classes in comments or strings", () => {
		const text = [
			"// class A {}",
			'const s = "class B {}";',
			// biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is source text
			"const t = `class C ${1} {}`;",
			"export class D {}",
		].join("\n");

		expect(new OneClassPerFile().check(text)).toEqual([]);
	});

	it("keeps counting top-level classes after a template substitution", () => {
		const text = [
			// biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is source text
			"const s = `a${1}b`;",
			"class A {}",
			"class B {}",
		].join("\n");

		expect(new OneClassPerFile().check(text)).toEqual([
			{ line: 3, column: 1, message: expect.stringContaining("own file") },
		]);
	});

	it("ignores a class nested inside the one it allows", () => {
		const text = [
			"export class B {",
			"\tinner() {",
			"\t\treturn class {};",
			"\t}",
			"}",
		].join("\n");

		expect(new OneClassPerFile().check(text)).toEqual([]);
	});
});
