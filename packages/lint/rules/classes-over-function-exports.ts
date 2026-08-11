import type { Rule } from "../rule";
import { SyntaxKind, type Token, tokens } from "../scan";

// Modifiers that may sit between `export` and `function`.
const MODIFIERS = new Set<SyntaxKind>([
	SyntaxKind.AsyncKeyword,
	SyntaxKind.DefaultKeyword,
]);

/**
 * A file may export one function that takes a function-typed parameter.
 * Several mean the callers wire the same dependencies at every site: group
 * them into a class that receives those dependencies once, through its
 * constructor. Interface-typed dependencies need the same treatment but
 * cannot be told from plain data mechanically, so they stay a review call.
 */
export const classesOverFunctionExports: Rule = {
	id: "classes-over-function-exports",
	files: "**/*.ts",
	level: "error",
	check(text) {
		const all = tokens(text);
		const injecting: Token[] = [];
		for (const [i, t] of all.entries()) {
			if (t.kind !== SyntaxKind.ExportKeyword || t.depth !== 0) {
				continue;
			}
			let j = i + 1;
			while (MODIFIERS.has(all[j]?.kind ?? SyntaxKind.EndOfFile)) {
				j++;
			}
			if (all[j]?.kind !== SyntaxKind.FunctionKeyword) {
				continue;
			}
			if (injects(all, j)) {
				injecting.push(all[j] ?? t);
			}
		}
		return injecting.slice(1).map((t) => ({
			line: t.line,
			column: t.column,
			message:
				"several exported functions inject their dependencies: " +
				"group them into a class that takes those once, in its constructor",
		}));
	},
};

/** Whether the function starting at token `at` has a function-typed param. */
function injects(all: Token[], at: number): boolean {
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
