import doc from "./no-ponytail-prefixes.md" with { type: "text" };
import type { Rule } from "./rule";

export class NoPonytailPrefixes implements Rule {
	readonly id = "no-ponytail-prefixes";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;
}
