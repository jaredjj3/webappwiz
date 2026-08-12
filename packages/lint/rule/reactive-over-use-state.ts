import doc from "./reactive-over-use-state.md" with { type: "text" };
import type { Rule } from "./rule";

export class ReactiveOverUseState implements Rule {
	readonly id = "reactive-over-use-state";
	readonly files = "**/*.{ts,tsx}";
	readonly level = "warning";
	readonly document = doc;
}
