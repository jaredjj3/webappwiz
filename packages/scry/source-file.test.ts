import { describe, expect, it } from "bun:test";
import { SourceFile } from "./source-file";

describe("SourceFile", () => {
	it("names itself by the file name up to its first dot", () => {
		expect(new SourceFile("src/cart.test.ts", "").stem).toEqual("cart");
	});

	it("finds each match of a pattern at its line", () => {
		const file = new SourceFile(
			"a.md",
			"one\ntwo \u2014 three\nfour \u2014 five\n",
		);

		expect(
			file.matches(/\u2014/g).map((match) => [match.line, match.text]),
		).toEqual([
			[2, "\u2014"],
			[3, "\u2014"],
		]);
	});

	it("lists top-level classes, exported or not, and leaves out class expressions and nested ones", () => {
		const file = new SourceFile(
			"a.ts",
			"export class A {}\nclass B {}\nconst C = class {};\nfunction f() { class D {} }\nexport abstract class E {}\n",
		);

		expect(
			file.ts.topLevelClasses().map((cls) => [cls.name, cls.line]),
		).toEqual([
			["A", 1],
			["B", 2],
			["E", 5],
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

	it("lists the top-level statements, with an export unwrapped to what it exports", () => {
		const file = new SourceFile(
			"a.ts",
			'import x from "x";\nexport function f() {}\nexport { g } from "./g";\nconst h = 1;\n',
		);

		expect(file.ts.topLevel().map((node) => [node.line, node.kind])).toEqual([
			[1, "import_statement"],
			[2, "function_declaration"],
			[3, "export_statement"],
			[4, "lexical_declaration"],
		]);
	});

	it("finds nodes by pattern, with what the pattern captured", () => {
		const file = new SourceFile(
			"a.ts",
			"class A {\n\tconstructor(b) {\n\t\tthis.b = b;\n\t}\n}\n",
		);
		const [assignment] = file.ts.findAll("this.$FIELD = $VALUE");

		expect([
			assignment?.line,
			assignment?.captured("FIELD")?.text,
			assignment?.captured("VALUE")?.kind,
		]).toEqual([3, "b", "identifier"]);
	});

	it("walks the tree by field, child and parent", () => {
		const file = new SourceFile("a.ts", "export class A {\n\tb = 1;\n}\n");
		const [cls] = file.ts.topLevel();

		expect([
			cls?.field("name")?.text,
			cls
				?.field("body")
				?.children()
				.map((node) => node.kind),
			cls?.parent()?.kind,
			cls?.end,
		]).toEqual(["A", ["public_field_definition"], "export_statement", 3]);
	});

	it("finds the body of every test, however it is declared", () => {
		const file = new SourceFile(
			"a.test.ts",
			'it("a", () => {});\ntest.only("b", function () {});\nit.each([1])("c", async () => {});\ndescribe("d", () => {});\nexpect.extend({ e() {} });\n',
		);

		expect(file.ts.tests().map((body) => body.line)).toEqual([1, 2, 3]);
	});
});
