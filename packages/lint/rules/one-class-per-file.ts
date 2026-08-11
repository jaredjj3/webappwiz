import type { Check } from "../rule";
import { SyntaxKind, tokens } from "../scan";

// `class` after one of these is a class expression, not a declaration.
const EXPRESSION_LEAD = new Set<SyntaxKind>([
	SyntaxKind.EqualsToken,
	SyntaxKind.OpenParenToken,
	SyntaxKind.CommaToken,
	SyntaxKind.ColonToken,
	SyntaxKind.ReturnKeyword,
	SyntaxKind.EqualsGreaterThanToken,
]);

/** A class is a file's whole idea; a second one wants a file of its own. */
export const oneClassPerFile: Check = (text) => {
	const all = tokens(text);
	const classes = all.filter(
		(t, i) =>
			t.kind === SyntaxKind.ClassKeyword &&
			t.depth === 0 &&
			!EXPRESSION_LEAD.has(all[i - 1]?.kind ?? SyntaxKind.EndOfFile),
	);
	return classes.slice(1).map((t) => ({
		line: t.line,
		column: t.column,
		message: "more than one class in this file: give each its own file",
	}));
};
