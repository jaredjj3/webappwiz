import doc from "./comments-say-why-not-what.md" with { type: "text" };
import type { Judged } from "./rule";

export class CommentsSayWhyNotWhat implements Judged {
	readonly id = "comments-say-why-not-what";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly judgedBy = "agent";
	readonly document = doc;
}
