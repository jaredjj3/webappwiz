import doc from "./doc-comments-address-users.md" with { type: "text" };
import type { Judged } from "./rule";

export class DocCommentsAddressUsers implements Judged {
	readonly id = "doc-comments-address-users";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly judgedBy = "agent";
	readonly document = doc;
}
