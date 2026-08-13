import { Hit } from "../hit";
import { SyntaxKind, tokens } from "../scan";
import doc from "./one-class-per-file.md" with { type: "text" };
import type { Rule } from "./rule";

export class OneClassPerFile implements Rule {
	// `class` after one of these is a class expression, not a declaration.
	private static readonly EXPRESSION_LEAD = new Set<SyntaxKind>([
		SyntaxKind.EqualsToken,
		SyntaxKind.OpenParenToken,
		SyntaxKind.CommaToken,
		SyntaxKind.ColonToken,
		SyntaxKind.ReturnKeyword,
		SyntaxKind.EqualsGreaterThanToken,
	]);
	private static readonly MESSAGE =
		"more than one class in this file: give each its own file";

	readonly id = "one-class-per-file";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;

	check(text: string): Hit[] {
		const all = tokens(text);
		return all
			.filter(
				(token, i) =>
					token.kind === SyntaxKind.ClassKeyword &&
					token.depth === 0 &&
					!OneClassPerFile.EXPRESSION_LEAD.has(
						all[i - 1]?.kind ?? SyntaxKind.EndOfFile,
					),
			)
			.slice(1)
			.map(
				(token) => new Hit(token.line, token.column, OneClassPerFile.MESSAGE),
			);
	}
}
