import doc from "./comments-say-why-not-what.md" with { type: "text" };
import type { Rule, Verdict } from "./rule";

export class CommentsSayWhyNotWhat implements Rule {
	readonly id = "comments-say-why-not-what";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;

	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
