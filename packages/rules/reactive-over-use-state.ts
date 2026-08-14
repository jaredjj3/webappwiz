import doc from "./reactive-over-use-state.md" with { type: "text" };
import type { FileRule, Verdict } from "./rule";

export class ReactiveOverUseState implements FileRule {
	readonly id = "reactive-over-use-state";
	readonly files = "**/*.{ts,tsx}";
	readonly level = "warning";
	readonly document = doc;

	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
