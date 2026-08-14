import type { FileRule, Verdict } from "@webappwiz/rules";
import doc from "./doc-comments-address-users.md" with { type: "text" };

export class DocCommentsAddressUsers implements FileRule {
	readonly id = "doc-comments-address-users";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;

	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
