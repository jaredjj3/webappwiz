import doc from "./reactive-over-use-state.md" with { type: "text" };
import type { Judged } from "./rule";

export class ReactiveOverUseState implements Judged {
	readonly id = "reactive-over-use-state";
	readonly files = "**/*.{ts,tsx}";
	readonly level = "warning";
	readonly judgedBy = "agent";
	readonly document = doc;
}
