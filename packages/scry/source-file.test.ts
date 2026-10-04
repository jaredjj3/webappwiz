import { describe, expect, it } from "bun:test";
import { SourceFile } from "./source-file";

describe("SourceFile", () => {
	it("names itself by the file name up to its first dot", () => {
		expect(new SourceFile("src/cart.test.ts", "").stem).toEqual("cart");
	});

	it("finds each match of a pattern at its line", () => {
		const file = new SourceFile("a.md", "one\ntwo — three\nfour — five\n");

		expect(file.matches(/—/g).map((match) => [match.line, match.text])).toEqual(
			[
				[2, "—"],
				[3, "—"],
			],
		);
	});

	it("lists top-level classes, exported or not, and leaves out class expressions and nested ones", () => {
		const file = new SourceFile(
			"a.ts",
			"export class A {}\nclass B {}\nconst C = class {};\nfunction f() { class D {} }\n",
		);

		expect(
			file.ts.topLevelClasses().map((cls) => [cls.name, cls.line]),
		).toEqual([
			["A", 1],
			["B", 2],
		]);
	});

	it("lists comments, telling doc comments apart, and leaves out scry's own directives", () => {
		const file = new SourceFile(
			"a.ts",
			"/** Docs. */\n// why\n// scry-ignore no-foo: reason\n/* block */\nconst x = 1;\n",
		);

		expect(
			file.ts.comments().map((comment) => [comment.line, comment.doc]),
		).toEqual([
			[1, true],
			[2, false],
			[4, false],
		]);
	});

	it("reads a span with the lines after it", () => {
		const file = new SourceFile("a.ts", "// add one\nn += 1;\nreturn n;\n");
		const [comment] = file.ts.comments();

		expect(comment?.withNext(1)).toEqual("// add one\nn += 1;");
	});

	it("flags a span at its line, sure unless told otherwise", () => {
		const [comment] = new SourceFile("a.ts", "\n// x\n").ts.comments();

		expect(comment?.flag("no")).toEqual({
			line: 2,
			message: "no",
			confidence: 1,
		});
		expect(comment?.flag("no", 0.8, "Is it?")).toEqual({
			line: 2,
			message: "no",
			confidence: 0.8,
			decidedBy: "Is it?",
		});
	});
});
