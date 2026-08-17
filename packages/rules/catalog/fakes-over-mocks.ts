import type { FileRule, Verdict } from "../rule";
import doc from "./fakes-over-mocks.md" with { type: "text" };

export class FakesOverMocks implements FileRule {
	readonly id = "fakes-over-mocks";
	readonly files = "**/*.test.ts";
	readonly level = "error";
	readonly document = doc;

	check(): Verdict {
		return { findings: [], escalate: true };
	}
}
