import { Hit, SyntaxKind, tokens, type FileRule, type FileText, type Token, type Verdict } from "@webappwiz/rules";
import doc from "./named-options-last.md" with { type: "text" };

/** One slot of a parameter list, read as far as this check needs it. */
interface Parameter {
	/** The parameter's name, absent when the slot is not one the check reads:
	 * an argument, a destructured parameter, or a fragment of a type. */
	name: Token | undefined;
	/** Whether the annotation is an object type written in place. */
	inline: boolean;
	rest: boolean;
}

export class NamedOptionsLast implements FileRule {
	/** What a parameter may open with before its name. */
	private static readonly MODIFIERS = new Set<SyntaxKind>([
		SyntaxKind.PrivateKeyword,
		SyntaxKind.ProtectedKeyword,
		SyntaxKind.PublicKeyword,
		SyntaxKind.ReadonlyKeyword,
		SyntaxKind.OverrideKeyword,
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
	private static readonly OPTIONS = new Set(["options", "opts"]);
	private static readonly INLINE =
		"parameter takes an object type written in place: declare the options " +
		"type under a name and annotate the parameter with it";
	private static readonly LAST =
		"options parameter comes before another parameter: an options object " +
		"goes last, after what the call cannot omit";

	readonly id = "named-options-last";
	readonly files = "**/*.ts";
	readonly level = "warning";
	readonly document = doc;
	// The check sees an options object already in the parameter list, where
	// both its position and its type are certain. Whether a row of positional
	// parameters wanted to be one in the first place is the agent's half.

	check({ text }: FileText): Verdict {
		const all = tokens(text);
		const found: Hit[] = [];
		for (const [i, token] of all.entries()) {
			if (token.kind !== SyntaxKind.OpenParenToken) {
				continue;
			}
			const params = this.parameters(all, i);
			for (const [at, param] of params.entries()) {
				const name = param.name;
				// An inline object type is only this rule's business on an options
				// parameter: elsewhere it is the shape of a value, not a bag of
				// settings, and naming it is a different argument to have.
				if (name === undefined || !NamedOptionsLast.OPTIONS.has(name.text)) {
					continue;
				}
				if (param.inline) {
					found.push(new Hit(name.line, name.column, NamedOptionsLast.INLINE));
				}
				if (
					params
						.slice(at + 1)
						.some((later) => later.name !== undefined && !later.rest)
				) {
					found.push(new Hit(name.line, name.column, NamedOptionsLast.LAST));
				}
			}
		}
		return { findings: found, escalate: true };
	}

	/** Every slot of the list opening at `open`, or nothing when those
	 * parentheses hold arguments rather than parameters. */
	private parameters(all: Token[], open: number): Parameter[] {
		const slots: Parameter[] = [];
		// Nesting inside the list: a comma separates parameters only at 0, not
		// inside an object type or a default value. Type arguments are left to
		// the name test in `parameter`, since the scanner reads `>>` as one
		// token and balancing angles from a token stream cannot be trusted.
		let nesting = 0;
		let start = open + 1;
		for (let i = open + 1; i < all.length; i++) {
			const kind = all[i]?.kind ?? SyntaxKind.EndOfFile;
			if (NamedOptionsLast.OPENS.has(kind)) {
				nesting++;
			} else if (NamedOptionsLast.CLOSES.has(kind)) {
				if (nesting === 0) {
					slots.push(this.parameter(all, start, i));
					break;
				}
				nesting--;
			} else if (kind === SyntaxKind.CommaToken && nesting === 0) {
				slots.push(this.parameter(all, start, i));
				start = i + 1;
			}
		}
		return slots.some((param) => param.name !== undefined) ? slots : [];
	}

	/** The slot between `start` and `end`, read as a parameter. It is one only
	 * when it names something and annotates it: an argument does neither, which
	 * is what keeps a call's parentheses out of this. */
	private parameter(all: Token[], start: number, end: number): Parameter {
		let i = start;
		while (
			i < end &&
			NamedOptionsLast.MODIFIERS.has(all[i]?.kind ?? SyntaxKind.EndOfFile)
		) {
			i++;
		}
		const rest = all[i]?.kind === SyntaxKind.DotDotDotToken;
		if (rest) {
			i++;
		}
		const name = all[i];
		if (i >= end || name?.kind !== SyntaxKind.Identifier) {
			return { name: undefined, inline: false, rest };
		}
		i++;
		if (all[i]?.kind === SyntaxKind.QuestionToken) {
			i++;
		}
		if (all[i]?.kind !== SyntaxKind.ColonToken) {
			return { name: undefined, inline: false, rest };
		}
		return {
			name,
			inline: all[i + 1]?.kind === SyntaxKind.OpenBraceToken,
			rest,
		};
	}
}
