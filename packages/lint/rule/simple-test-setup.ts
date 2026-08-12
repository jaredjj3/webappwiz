import type { Rule } from "./rule";
import doc from "./simple-test-setup.md" with { type: "text" };

export class SimpleTestSetup implements Rule {
	readonly id = "simple-test-setup";
	readonly files = "**/*.test.ts";
	readonly level = "error";
	readonly document = doc;
}
