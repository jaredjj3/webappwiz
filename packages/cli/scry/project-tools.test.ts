import { describe, expect, it } from "bun:test";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { ProjectTools } from "./project-tools";

/** Credential discovery starts with git; fail before it can reach native stores. */
class NoDiscoveryPs extends FakePs {
	override async spawnCapture(): Promise<never> {
		throw new Error("credential discovery forbidden in this fixture");
	}
}

describe("ProjectTools credential boundary", () => {
	it.each([{}, { som: "fixture", llm: "fixture" }])(
		"does not open credentials before a model is asked (%j)",
		async (disabled) => {
			const ps = new NoDiscoveryPs();
			const fs = new FakeFs();
			const tools = await ProjectTools.open("/repo", {
				models: { som: { default: "clef" }, llm: { default: "claude-test" } },
				jobs: 1,
				disabled,
				ps,
				fs,
			});
			expect(ps.getCalls()).toEqual([]);
			expect(tools.spent.requests).toBe(0);
		},
	);
});
