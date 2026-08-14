import {
	type FileRule,
	type FileText,
	Hit,
	SyntaxKind,
	type Token,
	tokens,
	type Verdict,
} from "@webappwiz/rules";
import doc from "./parameters-declare-fields.md" with { type: "text" };

export class ParametersDeclareFields implements FileRule {
	/** A parameter starting with one of these already declares its field, or
	 * cannot: a parameter property, or a rest parameter. */
	private static readonly DECLARES = new Set<SyntaxKind>([
		SyntaxKind.PrivateKeyword,
		SyntaxKind.ProtectedKeyword,
		SyntaxKind.PublicKeyword,
		SyntaxKind.ReadonlyKeyword,
		SyntaxKind.OverrideKeyword,
		SyntaxKind.AtToken,
		SyntaxKind.DotDotDotToken,
	]);
	/** What follows a parameter's name: its type, its default, the next
	 * parameter, or the end of the list. */
	private static readonly NAMED = new Set<SyntaxKind>([
		SyntaxKind.ColonToken,
		SyntaxKind.EqualsToken,
		SyntaxKind.CommaToken,
		SyntaxKind.CloseParenToken,
	]);
	private static readonly OPENS = new Set<SyntaxKind>([
		SyntaxKind.OpenParenToken,
		SyntaxKind.OpenBracketToken,
		SyntaxKind.OpenBraceToken,
	]);
	private static readonly CLOSES = new Set<SyntaxKind>([
		SyntaxKind.CloseParenToken,
		SyntaxKind.CloseBracketToken,
		SyntaxKind.CloseBraceToken,
	]);
	private static readonly MESSAGE =
		"constructor copies a parameter into a field of the same name: put the " +
		"modifier on the parameter and drop the declaration and the assignment";

	readonly id = "parameters-declare-fields";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;

	check({ text }: FileText): Verdict {
		const all = tokens(text);
		const found: Hit[] = [];
		for (const [i, token] of all.entries()) {
			if (
				token.kind !== SyntaxKind.ConstructorKeyword ||
				all[i + 1]?.kind !== SyntaxKind.OpenParenToken
			) {
				continue;
			}
			const close = this.closeParen(all, i + 1);
			const plain = this.plainParameters(all, i + 1, close);
			if (plain.size > 0) {
				found.push(...this.copies(all, close + 1, plain));
			}
		}
		return { findings: found };
	}

	/** The index of the parenthesis closing the list opening at `at`, or the
	 * end of the stream when the source is unbalanced. */
	private closeParen(all: Token[], at: number): number {
		let parens = 0;
		for (let i = at; i < all.length; i++) {
			const kind = all[i]?.kind;
			if (kind === SyntaxKind.OpenParenToken) {
				parens++;
			} else if (kind === SyntaxKind.CloseParenToken && --parens === 0) {
				return i;
			}
		}
		return all.length;
	}

	/** The names of the parameters declaring no field of their own, which are
	 * the only ones a body assignment could be replacing. */
	private plainParameters(
		all: Token[],
		open: number,
		close: number,
	): Set<string> {
		const names = new Set<string>();
		// Nesting inside the list: a comma separates parameters only at 0, not
		// inside an object type or a default value. Type arguments are left to
		// the name test below, since the scanner reads `>>` as one token and
		// balancing angles from a token stream alone cannot be trusted.
		let nesting = 0;
		let starting = true;
		for (let i = open + 1; i < close; i++) {
			const token = all[i];
			if (token === undefined) {
				break;
			}
			if (ParametersDeclareFields.OPENS.has(token.kind)) {
				nesting++;
			} else if (ParametersDeclareFields.CLOSES.has(token.kind)) {
				nesting--;
			}
			if (nesting > 0) {
				continue;
			}
			if (token.kind === SyntaxKind.CommaToken) {
				starting = true;
			} else if (!starting) {
				continue;
			}
			if (ParametersDeclareFields.DECLARES.has(token.kind)) {
				starting = false;
			} else if (token.kind === SyntaxKind.Identifier) {
				starting = false;
				if (this.isName(all, i)) {
					names.add(token.text);
				}
			}
		}
		return names;
	}

	/** Whether the identifier at `at` is a parameter's name rather than a word
	 * from the type it sits in, `optional?` included. */
	private isName(all: Token[], at: number): boolean {
		const next =
			all[at + 1]?.kind === SyntaxKind.QuestionToken
				? all[at + 2]?.kind
				: all[at + 1]?.kind;
		return next !== undefined && ParametersDeclareFields.NAMED.has(next);
	}

	/** Every `this.x = x;` standing alone at the top of the constructor body
	 * opening at `at`. Anything computed, conditional or renamed is a decision
	 * the constructor makes, and no parameter property. */
	private copies(all: Token[], at: number, plain: Set<string>): Hit[] {
		const body = all[at];
		if (body?.kind !== SyntaxKind.OpenBraceToken) {
			return [];
		}
		const found: Hit[] = [];
		for (let i = at + 1; i < all.length; i++) {
			const token = all[i];
			if (token === undefined) {
				break;
			}
			if (
				token.kind === SyntaxKind.CloseBraceToken &&
				token.depth === body.depth
			) {
				break;
			}
			const field = all[i + 2];
			const value = all[i + 4];
			const ends = all[i + 5]?.kind;
			if (
				token.kind === SyntaxKind.ThisKeyword &&
				token.depth === body.depth + 1 &&
				all[i + 1]?.kind === SyntaxKind.DotToken &&
				field?.kind === SyntaxKind.Identifier &&
				all[i + 3]?.kind === SyntaxKind.EqualsToken &&
				value?.kind === SyntaxKind.Identifier &&
				value.text === field.text &&
				plain.has(field.text) &&
				(ends === SyntaxKind.SemicolonToken ||
					ends === SyntaxKind.CloseBraceToken)
			) {
				found.push(
					new Hit(token.line, token.column, ParametersDeclareFields.MESSAGE),
				);
			}
		}
		return found;
	}
}
