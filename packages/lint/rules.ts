import type { Finding, Rule } from "./rule";
import { SyntaxKind, type Token, tokens } from "./scan";

const EM = "\u2014";

/**
 * Em dashes are the surest tell that a machine wrote the text. An en dash
 * between words counts too; between digits it is a range and stays.
 */
export const noEmDashes: Rule = {
	id: "no-em-dashes",
	files: "**/*.{ts,md}",
	level: "error",
	check(text) {
		const findings: Finding[] = [];
		for (const [i, line] of text.split("\n").entries()) {
			for (const match of line.matchAll(/[\u2013\u2014]/g)) {
				const range =
					/\d/.test(line[match.index - 1] ?? "") &&
					/\d/.test(line[match.index + 1] ?? "");
				if (match[0] !== EM && range) {
					continue;
				}
				findings.push({
					line: i + 1,
					column: match.index + 1,
					message:
						match[0] === EM
							? "em dash: use a colon, comma, parentheses, or a full stop"
							: "en dash between words: only a digit range keeps one",
				});
			}
		}
		return findings;
	},
};

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
export const oneClassPerFile: Rule = {
	id: "one-class-per-file",
	files: "**/*.ts",
	level: "error",
	check(text) {
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
	},
};

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

/** The rules every webappwiz repository runs. */
export const recommended: Rule[] = [
	noEmDashes,
	oneClassPerFile,
	classesOverFunctionExports,
];
