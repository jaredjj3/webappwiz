import { Finding } from "../finding";
import { SyntaxKind, type Token, tokens } from "../scan";
import type { Rule } from "./rule";
import doc from "./tests-read-like-sentences.md" with { type: "text" };

export class TestsReadLikeSentences implements Rule {
	private static readonly MESSAGE =
		"more than one describe call in this file: a test file makes exactly one";

	readonly id = "tests-read-like-sentences";
	readonly files = "**/*.test.ts";
	readonly level = "error";
	readonly document = doc;
	// The check counts describe calls, where a second one is certain. Whether
	// a title completes "it ..." naturally still needs the agent.
	readonly partial = true;

	check(text: string): Finding[] {
		const all = tokens(text);
		return all
			.filter((_, i) => this.isDescribeCall(all, i))
			.slice(1)
			.map(
				(t) => new Finding(t.line, t.column, TestsReadLikeSentences.MESSAGE),
			);
	}

	/** Whether the token at `at` opens a describe call, `describe(` and
	 * modified forms like `describe.concurrent(` alike. */
	private isDescribeCall(all: Token[], at: number): boolean {
		const t = all[at];
		if (
			t?.kind !== SyntaxKind.Identifier ||
			t.text !== "describe" ||
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
