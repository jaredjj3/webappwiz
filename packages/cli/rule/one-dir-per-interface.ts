import { type FileRule, type Verdict } from "@webappwiz/rules";
import doc from "./one-dir-per-interface.md" with { type: "text" };

export class OneDirPerInterface implements FileRule {
	readonly id = "one-dir-per-interface";
	readonly files = "**/*.ts";
	readonly level = "warning";
	readonly document = doc;

	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
