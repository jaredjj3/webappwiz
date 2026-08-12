import doc from "./doc-comments-address-users.md" with { type: "text" };
import type { Rule } from "./rule";

export class DocCommentsAddressUsers implements Rule {
	readonly id = "doc-comments-address-users";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;
}
