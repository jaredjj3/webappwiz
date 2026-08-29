import { Hit } from "../hit";
import type { FileRule, FileText, Verdict } from "../rule";
import { SyntaxKind, type Token, tokens } from "../scan";
import doc from "./export-leads-the-file.md" with { type: "text" };

export class ExportLeadsTheFile implements FileRule {
	// `class` or `function` after one of these is an expression, not a
	// declaration, so it has no name to compare against the file's.
	private static readonly EXPRESSION_LEAD = new Set<SyntaxKind>([
		SyntaxKind.EqualsToken,
		SyntaxKind.OpenParenToken,
		SyntaxKind.CommaToken,
		SyntaxKind.ColonToken,
		SyntaxKind.ReturnKeyword,
		SyntaxKind.EqualsGreaterThanToken,
	]);
	private static readonly DECLARES = new Set<SyntaxKind>([
		SyntaxKind.ClassKeyword,
		SyntaxKind.FunctionKeyword,
	]);
	// Modifiers a declaration may carry between `export` and its keyword.
	private static readonly MODIFIERS = new Set<SyntaxKind>([
		SyntaxKind.AbstractKeyword,
		SyntaxKind.AsyncKeyword,
		SyntaxKind.DeclareKeyword,
		SyntaxKind.DefaultKeyword,
	]);
	private static readonly MESSAGE =
		"declared above the export this file is named after: move it below";

	readonly id = "export-leads-the-file";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;
	// The check sees an unexported class or function declared above the file's
	// namesake, which is a helper and certain. An exported one is part of the
	// file's surface rather than a helper, an arrow helper reads as a constant
	// in a token stream and constants are allowed above, and how far down is
	// too far is a judgment: all three stay with the agent.

	check({ path, text }: FileText): Verdict {
		const all = tokens(text);
		const declared = all.flatMap((_token, i) => this.declaration(all, i));
		const namesake = this.namesake(path);
		const at = declared.findIndex(
			({ name }) => name.toLowerCase() === namesake,
		);
		const findings = declared
			.slice(0, Math.max(at, 0))
			.filter(({ exported }) => !exported)
			.map(
				({ token }) =>
					new Hit(token.line, token.column, ExportLeadsTheFile.MESSAGE),
			);
		return { findings, escalate: true };
	}

	/** The name a file claims for its export, lowercased and stripped of the
	 * separators the two casings differ by, so `one-class-per-file.ts` and
	 * `OneClassPerFile` both come back `oneclassperfile`. */
	private namesake(path: string): string {
		const base = path.split("/").at(-1) ?? path;
		return (base.split(".")[0] ?? "").replaceAll(/[-_]/g, "").toLowerCase();
	}

	/** The top-level class or function declared at `at`, and whether it is
	 * exported, as a one item array a caller can flat map away, or an empty one
	 * when the token starts neither. */
	private declaration(
		all: Token[],
		at: number,
	): { token: Token; name: string; exported: boolean }[] {
		const token = all[at];
		if (
			token === undefined ||
			token.depth !== 0 ||
			!ExportLeadsTheFile.DECLARES.has(token.kind) ||
			ExportLeadsTheFile.EXPRESSION_LEAD.has(
				all[at - 1]?.kind ?? SyntaxKind.EndOfFile,
			)
		) {
			return [];
		}
		// A generator puts an asterisk between the keyword and the name.
		const named =
			all[at + 1]?.kind === SyntaxKind.AsteriskToken ? at + 2 : at + 1;
		const name = all[named];
		return name?.kind === SyntaxKind.Identifier
			? [{ token, name: name.text, exported: this.exported(all, at) }]
			: [];
	}

	/** Whether the declaration keyword at `at` carries an `export`, reading back
	 * over the modifiers that may sit between the two. */
	private exported(all: Token[], at: number): boolean {
		let i = at - 1;
		while (
			ExportLeadsTheFile.MODIFIERS.has(all[i]?.kind ?? SyntaxKind.EndOfFile)
		) {
			i--;
		}
		return all[i]?.kind === SyntaxKind.ExportKeyword;
	}
}
