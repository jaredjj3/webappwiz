import type { FileRule, Verdict } from "@webappwiz/rules";
import doc from "./comments-say-why-not-what.md" with { type: "text" };

export class CommentsSayWhyNotWhat implements FileRule {
	readonly id = "comments-say-why-not-what";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;

	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
