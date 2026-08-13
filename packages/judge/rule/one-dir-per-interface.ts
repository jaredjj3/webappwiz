import doc from "./one-dir-per-interface.md" with { type: "text" };
import type { Reviewed } from "./rule";

export class OneDirPerInterface implements Reviewed {
	readonly id = "one-dir-per-interface";
	readonly files = "**/*.ts";
	readonly level = "warning";
	readonly checkedBy = "agent";
	readonly document = doc;
}
