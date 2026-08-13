import doc from "./reactive-over-use-state.md" with { type: "text" };
import type { Reviewed } from "./rule";

export class ReactiveOverUseState implements Reviewed {
	readonly id = "reactive-over-use-state";
	readonly files = "**/*.{ts,tsx}";
	readonly level = "warning";
	readonly checkedBy = "agent";
	readonly document = doc;
}
