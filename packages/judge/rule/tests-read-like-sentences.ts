import { Hit } from "../hit";
import { SyntaxKind, type Token, tokens } from "../scan";
import type { PartlyChecked } from "./rule";
import doc from "./tests-read-like-sentences.md" with { type: "text" };

export class TestsReadLikeSentences implements PartlyChecked {
	private static readonly MESSAGE =
		"more than one describe call in this file: a test file makes exactly one";

	readonly id = "tests-read-like-sentences";
	readonly files = "**/*.test.ts";
	readonly level = "error";
	readonly checkedBy = "code-then-agent";
	readonly document = doc;
	// The check counts describe calls, where a second one is certain. Whether
	// a title completes "it ..." naturally still needs the agent.

	check(text: string): Hit[] {
		const all = tokens(text);
		return all
			.filter((_, i) => this.isDescribeCall(all, i))
			.slice(1)
			.map(
				(token) =>
					new Hit(token.line, token.column, TestsReadLikeSentences.MESSAGE),
			);
	}

	/** Whether the token at `at` opens a describe call, `describe(` and
	 * modified forms like `describe.concurrent(` alike. */
	private isDescribeCall(all: Token[], at: number): boolean {
		const token = all[at];
		if (
			token?.kind !== SyntaxKind.Identifier ||
			token.text !== "describe" ||
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
