import doc from "./doc-comments-address-users.md" with { type: "text" };
import type { FileRule, Verdict } from "./rule";

export class DocCommentsAddressUsers implements FileRule {
	readonly id = "doc-comments-address-users";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;

	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
