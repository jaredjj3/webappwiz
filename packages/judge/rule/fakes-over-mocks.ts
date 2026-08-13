import doc from "./fakes-over-mocks.md" with { type: "text" };
import type { Judged } from "./rule";

export class FakesOverMocks implements Judged {
	readonly id = "fakes-over-mocks";
	readonly files = "**/*.test.ts";
	readonly level = "error";
	readonly judgedBy = "agent";
	readonly document = doc;
}
