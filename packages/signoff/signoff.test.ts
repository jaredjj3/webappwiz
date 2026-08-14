import { describe, expect, it } from "bun:test";
import type { Changeset } from "./changeset";
import type { Rule } from "./rule/rule";
import { Signoff } from "./signoff";

const changeset: Changeset = {
	base: "main",
	changes: [{ path: "src/a.ts", status: "modified", added: ["const a = 1;"] }],
};

const objects: Rule = {
	id: "objects",
	document: "# Objects",
	check: () => ({ findings: [{ rule: "objects", message: "it objects" }] }),
};

const quiet: Rule = {
	id: "quiet",
	document: "# Quiet",
	check: () => ({ findings: [] }),
};

const read: Rule = {
	id: "read",
	document: "# Read",
	check: () => ({ findings: [], escalate: true }),
};

describe("Signoff", () => {
	it("ships a change no rule objects to", () => {
		const decision = new Signoff([quiet]).check(changeset);

		expect(decision).toEqual({ ships: true, reasons: [], unreviewed: [] });
	});

	it("stops a change on one rule's objection, whatever the others say", () => {
		const decision = new Signoff([quiet, objects]).check(changeset);

		expect(decision.ships).toBe(false);
		expect(decision.reasons.map((reason) => reason.rule)).toEqual(["objects"]);
	});

	it("ships when it has no rules at all, having been asked nothing", () => {
		expect(new Signoff([]).check(changeset).ships).toBe(true);
	});

	it("names a rule its check escalated, and ships without waiting on it", () => {
		// The agent's reading is advisory here: an unpaid run still decides.
		expect(new Signoff([read]).check(changeset)).toEqual({
			ships: true,
			reasons: [],
			unreviewed: ["read"],
		});
	});
});
