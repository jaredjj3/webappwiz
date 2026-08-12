import { Finding } from "../finding";
import { SyntaxKind, type Token, tokens } from "../scan";
import type { Rule } from "./rule";
import doc from "./simple-test-setup.md" with { type: "text" };

export class SimpleTestSetup implements Rule {
	private static readonly LOOPS = new Set<SyntaxKind>([
		SyntaxKind.ForKeyword,
		SyntaxKind.WhileKeyword,
		SyntaxKind.DoKeyword,
	]);
	private static readonly TESTS = new Set(["it", "test"]);
	private static readonly MESSAGE =
		"test registered by a loop: write each test out so it reads on its own";

	readonly id = "simple-test-setup";
	readonly files = "**/*.test.ts";
	readonly level = "error";
	readonly document = doc;
	// The check sees tests a loop generates, which are certain. Whether setup
	// drowns the behavior under test still needs the agent.
	readonly partial = true;

	check(text: string): Finding[] {
		const all = tokens(text);
		const found: Finding[] = [];
		// Brace depth of each loop body currently open.
		const loops: number[] = [];
		for (const [i, token] of all.entries()) {
			if (
				token.kind === SyntaxKind.CloseBraceToken &&
				token.depth === loops.at(-1)
			) {
				loops.pop();
			} else if (SimpleTestSetup.LOOPS.has(token.kind)) {
				const body = this.bodyBrace(all, i);
				if (body !== null) {
					loops.push(body);
				}
			} else if (loops.length > 0 && this.isTestCall(all, i)) {
				found.push(
					new Finding(token.line, token.column, SimpleTestSetup.MESSAGE),
				);
			}
		}
		return found;
	}

	/** The brace depth of the loop body opening after the keyword at `at`, or
	 * null when the body is a lone braceless statement, which the agent keeps.
	 */
	private bodyBrace(all: Token[], at: number): number | null {
		let i = at + 1;
		if (all[i]?.kind === SyntaxKind.AwaitKeyword) {
			i++;
		}
		if (all[i]?.kind === SyntaxKind.OpenParenToken) {
			let parens = 0;
			for (; i < all.length; i++) {
				const kind = all[i]?.kind;
				if (kind === SyntaxKind.OpenParenToken) {
					parens++;
				} else if (kind === SyntaxKind.CloseParenToken && --parens === 0) {
					i++;
					break;
				}
			}
		}
		const body = all[i];
		return body?.kind === SyntaxKind.OpenBraceToken ? body.depth : null;
	}

	/** Whether the token at `at` registers a test, `it(` and modified forms
	 * like `it.each(` alike. */
	private isTestCall(all: Token[], at: number): boolean {
		const token = all[at];
		if (
			token?.kind !== SyntaxKind.Identifier ||
			!SimpleTestSetup.TESTS.has(token.text) ||
			all[at - 1]?.kind === SyntaxKind.DotToken
		) {
			return false;
		}
		let i = at + 1;
		while (
			all[i]?.kind === SyntaxKind.DotToken &&
			all[i + 1]?.kind === SyntaxKind.Identifier
		) {
			i += 2;
		}
		return all[i]?.kind === SyntaxKind.OpenParenToken;
	}
}
