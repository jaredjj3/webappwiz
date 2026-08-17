import { Hit } from "../hit";
import type { FileRule, FileText, Verdict } from "../rule";
import { SyntaxKind, type Token, tokens } from "../scan";
import doc from "./simple-test-setup.md" with { type: "text" };

export class SimpleTestSetup implements FileRule {
	private static readonly LOOPS = new Set<SyntaxKind>([
		SyntaxKind.ForKeyword,
		SyntaxKind.WhileKeyword,
		SyntaxKind.DoKeyword,
	]);
	private static readonly TESTS = new Set(["it", "test"]);
	private static readonly DESCRIBES = new Set(["describe"]);
	private static readonly LOOPED =
		"test registered by a loop: write each test out so it reads on its own";
	private static readonly REPEATED =
		"more than one describe call in this file: a test file makes exactly one";

	readonly id = "simple-test-setup";
	readonly files = "**/*.test.ts";
	readonly level = "error";
	readonly document = doc;
	// The check sees tests a loop generates and every describe after the first,
	// which are certain. Whether a title completes "it ..." naturally, and
	// whether setup drowns the behavior under test, still need the agent.

	check({ text }: FileText): Verdict {
		const all = tokens(text);
		const found: Hit[] = [];
		// The token stream is flat, so the only way to know a loop body ended is
		// the depth its opening brace sat at coming back around.
		const loops: number[] = [];
		let describes = 0;
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
			} else if (this.isCall(all, i, SimpleTestSetup.DESCRIBES)) {
				if (describes++ > 0) {
					found.push(
						new Hit(token.line, token.column, SimpleTestSetup.REPEATED),
					);
				}
			} else if (
				loops.length > 0 &&
				this.isCall(all, i, SimpleTestSetup.TESTS)
			) {
				found.push(new Hit(token.line, token.column, SimpleTestSetup.LOOPED));
			}
		}
		return { findings: found, escalate: true };
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

	/** Whether the token at `at` calls one of `names`, `it(` and modified forms
	 * like `it.each(` or `describe.concurrent(` alike. */
	private isCall(all: Token[], at: number, names: Set<string>): boolean {
		const token = all[at];
		if (
			token?.kind !== SyntaxKind.Identifier ||
			!names.has(token.text) ||
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
