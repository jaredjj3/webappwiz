import doc from "./fakes-over-mocks.md" with { type: "text" };
import type { Rule, Verdict } from "./rule";

export class FakesOverMocks implements Rule {
	readonly id = "fakes-over-mocks";
	readonly files = "**/*.test.ts";
	readonly level = "error";
	readonly document = doc;

	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
