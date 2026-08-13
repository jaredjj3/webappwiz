import doc from "./doc-comments-address-users.md" with { type: "text" };
import type { Reviewed } from "./rule";

export class DocCommentsAddressUsers implements Reviewed {
	readonly id = "doc-comments-address-users";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly checkedBy = "agent";
	readonly document = doc;
}
