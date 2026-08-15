import type { FileRule, Verdict } from "../rule";
import doc from "./resources-are-disposable.md" with { type: "text" };

export class ResourcesAreDisposable implements FileRule {
	readonly id = "resources-are-disposable";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;

	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
