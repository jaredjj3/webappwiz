import type { FileRule, Verdict } from "../rule";
import doc from "./matchers-over-test-logic.md" with { type: "text" };

export class MatchersOverTestLogic implements FileRule {
	readonly id = "matchers-over-test-logic";
	readonly files = "**/*.test.ts";
	readonly level = "error";
	readonly document = doc;
	// Whether a branch is a missing matcher or a loop is a missing harness is
	// the agent's call. The mechanical case code can settle, a loop registering
	// tests, `simple-test-setup` already flags.

	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
