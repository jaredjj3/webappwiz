import doc from "./fakes-over-mocks.md" with { type: "text" };
import type { Reviewed } from "./rule";

export class FakesOverMocks implements Reviewed {
	readonly id = "fakes-over-mocks";
	readonly files = "**/*.test.ts";
	readonly level = "error";
	readonly checkedBy = "agent";
	readonly document = doc;
}
