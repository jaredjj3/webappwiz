import { LanguageVariant, SyntaxKind } from "typescript/unstable/ast";
import {
	computeLineStarts,
	createScanner,
} from "typescript/unstable/ast/scanner";

export { SyntaxKind };

export interface Token {
	kind: SyntaxKind;
	text: string;
	/** 1-based. */
	line: number;
	/** 1-based. */
	column: number;
	/** Brace depth the token sits at: 0 is the top level of the file. */
	depth: number;
}

// After one of these, a `/` is division. Anywhere else it starts a regex
// literal. The scanner is context-free, so this parser decision falls to us.
const DIVIDES = new Set<SyntaxKind>([
	SyntaxKind.Identifier,
	SyntaxKind.StringLiteral,
	SyntaxKind.NumericLiteral,
	SyntaxKind.RegularExpressionLiteral,
	SyntaxKind.NoSubstitutionTemplateLiteral,
	SyntaxKind.TemplateTail,
	SyntaxKind.CloseParenToken,
	SyntaxKind.CloseBracketToken,
	SyntaxKind.ThisKeyword,
	SyntaxKind.TrueKeyword,
	SyntaxKind.FalseKeyword,
	SyntaxKind.NullKeyword,
]);

/**
 * Tokenizes TypeScript source. Comments and string contents never appear as
 * tokens, so a rule matching the stream cannot be fooled by either.
 */
export function tokens(source: string): Token[] {
	const scanner = createScanner(true, LanguageVariant.Standard, source);
	const starts = computeLineStarts(source);
	const out: Token[] = [];
	// Brace depth at each unclosed `${`, so a template's closing brace is not
	// mistaken for a block's. Rescanning there is the same move the parser
	// makes; without it every substitution would skew the depth count.
	const templates: number[] = [];
	let depth = 0;
	let line = 0;
	while (scanner.scan() !== SyntaxKind.EndOfFile) {
		let kind = scanner.getToken();
		if (
			(kind === SyntaxKind.SlashToken ||
				kind === SyntaxKind.SlashEqualsToken) &&
			!DIVIDES.has(out.at(-1)?.kind ?? SyntaxKind.EndOfFile)
		) {
			kind = scanner.reScanSlashToken();
		}
		if (
			kind === SyntaxKind.CloseBraceToken &&
			depth === templates[templates.length - 1]
		) {
			kind = scanner.reScanTemplateToken(false);
			if (kind !== SyntaxKind.TemplateMiddle) {
				templates.pop();
			}
		} else if (kind === SyntaxKind.CloseBraceToken) {
			depth = Math.max(0, depth - 1);
		}
		const start = scanner.getTokenStart();
		while (line + 1 < starts.length && (starts[line + 1] ?? 0) <= start) {
			line++;
		}
		out.push({
			kind,
			text: scanner.getTokenText(),
			line: line + 1,
			column: start - (starts[line] ?? 0) + 1,
			depth,
		});
		if (kind === SyntaxKind.OpenBraceToken) {
			depth++;
		} else if (kind === SyntaxKind.TemplateHead) {
			templates.push(depth);
		}
	}
	return out;
}
