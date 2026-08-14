import doc from "./one-dir-per-interface.md" with { type: "text" };
import type { Rule, Verdict } from "./rule";

export class OneDirPerInterface implements Rule {
	readonly id = "one-dir-per-interface";
	readonly files = "**/*.ts";
	readonly level = "warning";
	readonly document = doc;

	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
