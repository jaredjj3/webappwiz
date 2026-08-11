import type { Check } from "../rule";
import { SyntaxKind, type Token, tokens } from "../scan";

// Modifiers that may sit between `export` and `function`.
const MODIFIERS = new Set<SyntaxKind>([
	SyntaxKind.AsyncKeyword,
	SyntaxKind.DefaultKeyword,
]);

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

/**
 * The mechanical half of the rule: several exported functions with
 * function-typed parameters. Interface-typed dependencies need the same
 * treatment but cannot be told from plain data by a token scan, so the check
 * is partial and the rule stays with the agent.
 */
export const classesOverFunctionExports: Check = (text) => {
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
};
