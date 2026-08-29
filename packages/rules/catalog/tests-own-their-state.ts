import type { FileRule, Verdict } from "../rule";
import doc from "./tests-own-their-state.md" with { type: "text" };

export class TestsOwnTheirState implements FileRule {
	readonly id = "tests-own-their-state";
	readonly files = "**/*.test.ts";
	readonly level = "error";
	readonly document = doc;
	// Nothing here is mechanical. Whether a harness holds state, whether a
	// `beforeEach` sets up more than its own tests need, and whether a helper
	// bought clarity are all judgments about what a reader has to carry.

	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
