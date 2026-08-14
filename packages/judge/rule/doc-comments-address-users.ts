import doc from "./doc-comments-address-users.md" with { type: "text" };
import type { Rule, Verdict } from "./rule";

export class DocCommentsAddressUsers implements Rule {
	readonly id = "doc-comments-address-users";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;

	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
