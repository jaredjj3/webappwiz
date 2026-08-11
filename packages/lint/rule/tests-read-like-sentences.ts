import type { Rule } from "./rule";
import doc from "./tests-read-like-sentences.md" with { type: "text" };

export class TestsReadLikeSentences implements Rule {
	readonly id = "tests-read-like-sentences";
	readonly files = "**/*.test.ts";
	readonly level = "error";
	readonly document = doc;
}
