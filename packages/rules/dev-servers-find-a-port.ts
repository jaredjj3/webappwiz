import doc from "./dev-servers-find-a-port.md" with { type: "text" };
import type { FileRule, Verdict } from "./rule";

export class DevServersFindAPort implements FileRule {
	readonly id = "dev-servers-find-a-port";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;

	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
