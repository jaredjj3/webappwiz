import { type FileRule, type Verdict } from "@webappwiz/rules";
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
