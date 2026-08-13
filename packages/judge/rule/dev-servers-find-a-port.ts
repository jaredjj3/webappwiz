import doc from "./dev-servers-find-a-port.md" with { type: "text" };
import type { Rule } from "./rule";

export class DevServersFindAPort implements Rule {
	readonly id = "dev-servers-find-a-port";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;
}
