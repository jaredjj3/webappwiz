import { describe, expect, it } from "bun:test";
import type { Changeset } from "../changeset";
import type { Rule } from "./rule";
import { VisualWorkTested } from "./visual-work-tested";

const changeset: Changeset = {
	base: "main",
	changes: [
		{ path: "src/app.tsx", status: "modified", added: ["<h1>hi</h1>"] },
	],
};

// The document says what the rule is. What is here is that the code half
// claims nothing, and hands every change to the agent.
describe("visual-work-tested", () => {
	// Through the interface, since the check ignores the changeset it is handed.
	const rule: Rule = new VisualWorkTested();

	it("escalates a change rather than settling any of it", () => {
		expect(rule.check(changeset)).toEqual({
			findings: [],
			escalate: true,
		});
	});
});
