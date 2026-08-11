import { Finding } from "../finding";
import { SyntaxKind, type Token, tokens } from "../scan";
import doc from "./classes-over-function-exports.md" with { type: "text" };
import type { Rule } from "./rule";

export class ClassesOverFunctionExports implements Rule {
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
	readonly document = doc;
	// The check sees function-typed parameters but not interface-typed ones, so
	// it decides only half the rule and the agent still reads the rest.
	readonly partial = true;

	check(text: string): Finding[] {
		const all = tokens(text);
		const injecting: Token[] = [];
		for (const [i, t] of all.entries()) {
			if (t.kind !== SyntaxKind.ExportKeyword || t.depth !== 0) {
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
				injecting.push(all[j] ?? t);
			}
		}
		return injecting
			.slice(1)
			.map(
				(t) =>
					new Finding(t.line, t.column, ClassesOverFunctionExports.MESSAGE),
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
