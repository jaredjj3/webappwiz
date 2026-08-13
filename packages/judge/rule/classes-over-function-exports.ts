import { Hit } from "../hit";
import { SyntaxKind, type Token, tokens } from "../scan";
import doc from "./classes-over-function-exports.md" with { type: "text" };
import type { PartlyChecked } from "./rule";

export class ClassesOverFunctionExports implements PartlyChecked {
	// Modifiers that may sit between `export` and `function`.
	private static readonly MODIFIERS = new Set<SyntaxKind>([
		SyntaxKind.AsyncKeyword,
		SyntaxKind.DefaultKeyword,
	]);
	private static readonly MESSAGE =
		"several exported functions inject their dependencies: " +
		"group them into a class that takes those once, in its constructor";

	readonly id = "classes-over-function-exports";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly judgedBy = "both";
	readonly document = doc;
	// The check sees function-typed parameters but not interface-typed ones, so
	// it decides only half the rule and the agent still reads the rest.

	check(text: string): Hit[] {
		const all = tokens(text);
		const injecting: Token[] = [];
		for (const [i, token] of all.entries()) {
			if (token.kind !== SyntaxKind.ExportKeyword || token.depth !== 0) {
				continue;
			}
			let j = i + 1;
			while (
				ClassesOverFunctionExports.MODIFIERS.has(
					all[j]?.kind ?? SyntaxKind.EndOfFile,
				)
			) {
				j++;
			}
			if (all[j]?.kind !== SyntaxKind.FunctionKeyword) {
				continue;
			}
			if (this.injects(all, j)) {
				injecting.push(all[j] ?? token);
			}
		}
		return injecting
			.slice(1)
			.map(
				(token) =>
					new Hit(token.line, token.column, ClassesOverFunctionExports.MESSAGE),
			);
	}

	/** Whether the function starting at token `at` has a function-typed param. */
	private injects(all: Token[], at: number): boolean {
		let i = at;
		while (i < all.length && all[i]?.kind !== SyntaxKind.OpenParenToken) {
			i++;
		}
		let parens = 0;
		for (; i < all.length; i++) {
			const kind = all[i]?.kind;
			if (kind === SyntaxKind.OpenParenToken) {
				parens++;
			} else if (kind === SyntaxKind.CloseParenToken && --parens === 0) {
				return false;
			} else if (kind === SyntaxKind.EqualsGreaterThanToken) {
				return true;
			}
		}
		return false;
	}
}
