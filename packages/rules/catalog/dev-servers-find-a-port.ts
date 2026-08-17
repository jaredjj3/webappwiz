import type { FileRule, Verdict } from "../rule";
import doc from "./dev-servers-find-a-port.md" with { type: "text" };

export class DevServersFindAPort implements FileRule {
	readonly id = "dev-servers-find-a-port";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;

	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
