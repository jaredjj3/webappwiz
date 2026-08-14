import type { Rule } from "./rule";
import doc from "./tests-not-weakened.md" with { type: "text" };

/**
 * A document only: no command runs the signoff rules, so this is the whole of
 * the rule, and the agent about to merge is what applies it.
 */
export class TestsNotWeakened implements Rule {
	readonly id = "tests-not-weakened";
	readonly document = doc;
}
