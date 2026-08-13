import doc from "./one-dir-per-interface.md" with { type: "text" };
import type { Judged } from "./rule";

export class OneDirPerInterface implements Judged {
	readonly id = "one-dir-per-interface";
	readonly files = "**/*.ts";
	readonly level = "warning";
	readonly judgedBy = "agent";
	readonly document = doc;
}
