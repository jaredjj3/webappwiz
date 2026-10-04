import type { NapiConfig, SgNode } from "@ast-grep/napi";
import type { SourceFile } from "./source-file";
import { Span } from "./span";

/**
 * What finds nodes: an ast-grep pattern, like `this.$FIELD = $VALUE`, or a
 * rule, like `{ rule: { kind: "if_statement" } }`. See https://ast-grep.github.io.
 */
export type Matcher = string | NapiConfig;

/**
 * A node of a file's syntax tree, which a finding can point at like any span.
 * Its kinds are tree-sitter's TypeScript grammar's: `class_declaration`,
 * `call_expression`, `if_statement`.
 */
export class SyntaxNode extends Span {
	constructor(
		file: SourceFile,
		private node: SgNode,
	) {
		super(file, node.range().start.line + 1, node.text());
	}

	get kind(): string {
		return String(this.node.kind());
	}

	/** Its last line, from 1. */
	get end(): number {
		return this.node.range().end.line + 1;
	}

	/** Whether it is one of these kinds. */
	is(...kinds: string[]): boolean {
		return kinds.includes(this.kind);
	}

	/** The child the grammar names so, like a declaration's `name` or a call's `function`. */
	field(name: string): SyntaxNode | undefined {
		return this.wrap(this.node.field(name));
	}

	/** Its named children, leaving out punctuation. */
	children(): SyntaxNode[] {
		return this.node
			.namedChildren()
			.map((node) => new SyntaxNode(this.file, node));
	}

	parent(): SyntaxNode | undefined {
		return this.wrap(this.node.parent());
	}

	/** Its parent, its parent's parent, and so on up to the file. */
	ancestors(): SyntaxNode[] {
		return this.node.ancestors().map((node) => new SyntaxNode(this.file, node));
	}

	/** Every node under it, itself included, that the matcher matches. */
	findAll(matcher: Matcher): SyntaxNode[] {
		return this.node
			.findAll(matcher)
			.map((node) => new SyntaxNode(this.file, node));
	}

	/** What a pattern's `$NAME` matched, when it was found by one. */
	captured(name: string): SyntaxNode | undefined {
		return this.wrap(this.node.getMatch(name));
	}

	/** Whether it lies inside a node the matcher matches. */
	inside(matcher: Matcher): boolean {
		return this.node.inside(matcher);
	}

	private wrap(node: SgNode | null): SyntaxNode | undefined {
		return node === null ? undefined : new SyntaxNode(this.file, node);
	}
}
