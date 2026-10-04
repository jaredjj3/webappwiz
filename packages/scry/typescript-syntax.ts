import type { SgNode } from "@ast-grep/napi";
import { Comment } from "./comment";
import { Declaration } from "./declaration";
import type { SourceFile } from "./source-file";
import { type Matcher, SyntaxNode } from "./syntax-node";

/** A comment that is a scry-ignore or rule-ignore directive. */
const DIRECTIVE = /^(\/\/|\/\*+|#)\s*(scry|rule)-ignore/;

/** The functions that declare a test, as bun, vitest and jest name them. */
const TESTS = new Set(["it", "test"]);

/** A file's TypeScript syntax, as the things rules ask about. */
export class TypeScriptSyntax {
	constructor(
		private file: SourceFile,
		private node: SgNode,
	) {}

	/** The whole file, for rules that walk the tree themselves. */
	get root(): SyntaxNode {
		return new SyntaxNode(this.file, this.node);
	}

	/** Every node in the file that the matcher matches. */
	findAll(matcher: Matcher): SyntaxNode[] {
		return this.root.findAll(matcher);
	}

	/**
	 * The file's top-level statements, with an `export` unwrapped to what it
	 * exports: `export class A {}` is the class.
	 */
	topLevel(): SyntaxNode[] {
		return this.root
			.children()
			.map((node) =>
				node.is("export_statement")
					? (node.field("declaration") ?? node)
					: node,
			);
	}

	/** Classes declared at the top of the file, exported or not; class expressions are not declarations. */
	topLevelClasses(): Declaration[] {
		return this.topLevel()
			.filter((node) =>
				node.is("class_declaration", "abstract_class_declaration"),
			)
			.map(
				(node) =>
					new Declaration(
						this.file,
						node.line,
						node.text,
						node.field("name")?.text ?? "(anonymous)",
					),
			);
	}

	/** Every comment but scry's own `scry-ignore` directives, which are for the engine, not for rules. */
	comments(): Comment[] {
		return this.findAll({ rule: { kind: "comment" } })
			.filter((node) => !DIRECTIVE.test(node.text))
			.map((node) => new Comment(this.file, node.line, node.text));
	}

	/**
	 * The body of every test: the function handed to `it` or `test`, and to
	 * their `.only`, `.skip` and `.each(...)`.
	 */
	tests(): SyntaxNode[] {
		return this.findAll({ rule: { kind: "call_expression" } })
			.filter((call) => TESTS.has(callee(call)))
			.flatMap((call) =>
				(call.field("arguments")?.children() ?? []).filter((argument) =>
					argument.is("arrow_function", "function_expression"),
				),
			);
	}
}

/**
 * The name a call is made through, down to its root: `it` for `it(...)`,
 * `it.only(...)` and `it.each(cases)(...)`.
 */
function callee(call: SyntaxNode): string {
	let target = call.field("function");
	while (target?.is("member_expression", "call_expression")) {
		target = target.is("member_expression")
			? target.field("object")
			: target.field("function");
	}
	return target?.is("identifier") ? target.text : "";
}
