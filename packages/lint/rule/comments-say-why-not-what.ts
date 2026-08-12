import doc from "./comments-say-why-not-what.md" with { type: "text" };
import type { Rule } from "./rule";

export class CommentsSayWhyNotWhat implements Rule {
	readonly id = "comments-say-why-not-what";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;

	applies(text: string): boolean {
		// A URL and a divide both read as a comment here, and that is the safe
		// way to be wrong: the file costs a read the agent then finds nothing in.
		return text.includes("//") || text.includes("/*");
	}
}
