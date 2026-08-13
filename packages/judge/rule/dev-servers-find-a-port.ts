import doc from "./dev-servers-find-a-port.md" with { type: "text" };
import type { Judged } from "./rule";

export class DevServersFindAPort implements Judged {
	readonly id = "dev-servers-find-a-port";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly judgedBy = "agent";
	readonly document = doc;
}
