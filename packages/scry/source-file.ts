import { basename } from "node:path";
import { Lang, parse, type SgNode } from "@ast-grep/napi";
import type { Finding } from "./rule";

/** A comment that is a scry-ignore or rule-ignore directive. */
const DIRECTIVE = /^(\/\/|\/\*+|#)\s*(scry|rule)-ignore/;

/** One file a rule checks, with ways to look at it as text or as code. */
export class SourceFile {
	private syntax?: TypeScriptSyntax;

	constructor(
		/** From the project root. */
		readonly path: string,
		readonly text: string,
	) {}

	/** The file name up to its first dot: `cart` for `cart.test.ts`. */
	get stem(): string {
		return basename(this.path).replace(/\..*$/, "");
	}

	get lines(): string[] {
		return this.text.split("\n");
	}

	/** The file as TypeScript, parsed the first time it is asked for. */
	get ts(): TypeScriptSyntax {
		this.syntax ??= new TypeScriptSyntax(
			this,
			parse(
				this.path.endsWith(".tsx") ? Lang.Tsx : Lang.TypeScript,
				this.text,
			).root(),
		);
		return this.syntax;
	}

	/** Each match of a global pattern, at its line. */
	matches(pattern: RegExp): Span[] {
		return [...this.text.matchAll(pattern)].map(
			(match) =>
				new Span(
					this,
					this.text.slice(0, match.index).split("\n").length,
					match[0],
				),
		);
	}
}

/** A stretch of a file a finding can point at. */
export class Span {
	constructor(
		readonly file: SourceFile,
		/** Where it starts, from 1. */
		readonly line: number,
		readonly text: string,
	) {}

	/** The span and the lines after it, for a decider to read. */
	withNext(count: number): string {
		const last = this.line - 1 + this.text.split("\n").length + count;
		return this.file.lines.slice(this.line - 1, last).join("\n");
	}

	flag(message: string, confidence = 1, decidedBy?: string): Finding {
		return {
			line: this.line,
			message,
			confidence,
			...(decidedBy === undefined ? {} : { decidedBy }),
		};
	}
}

/** A comment, and whether it is a doc comment. */
export class Comment extends Span {
	get doc(): boolean {
		return this.text.startsWith("/**");
	}
}

/** A named declaration: a class, a function. */
export class Declaration extends Span {
	constructor(
		file: SourceFile,
		line: number,
		text: string,
		readonly name: string,
	) {
		super(file, line, text);
	}
}

/** A file's TypeScript syntax, as the things rules ask about. */
export class TypeScriptSyntax {
	constructor(
		private file: SourceFile,
		private root: SgNode,
	) {}

	/** Classes declared at the top of the file, exported or not; class expressions are not declarations. */
	topLevelClasses(): Declaration[] {
		return this.root
			.children()
			.map((node) =>
				node.kind() === "export_statement" ? node.field("declaration") : node,
			)
			.filter((node): node is SgNode => node?.kind() === "class_declaration")
			.map((node) => this.declaration(node));
	}

	/** Every comment but scry's own `scry-ignore` directives, which are for the engine, not for rules. */
	comments(): Comment[] {
		return this.root
			.findAll({ rule: { kind: "comment" } })
			.filter((node) => !DIRECTIVE.test(node.text()))
			.map(
				(node) =>
					new Comment(this.file, node.range().start.line + 1, node.text()),
			);
	}

	private declaration(node: SgNode): Declaration {
		return new Declaration(
			this.file,
			node.range().start.line + 1,
			node.text(),
			node.field("name")?.text() ?? "(anonymous)",
		);
	}
}
