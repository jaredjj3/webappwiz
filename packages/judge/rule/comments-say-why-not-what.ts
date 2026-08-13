import doc from "./comments-say-why-not-what.md" with { type: "text" };
import type { Reviewed } from "./rule";

export class CommentsSayWhyNotWhat implements Reviewed {
	readonly id = "comments-say-why-not-what";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly checkedBy = "agent";
	readonly document = doc;
}
