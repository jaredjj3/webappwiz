import { describe, expect, it } from "bun:test";
import type { Finding } from "@webappwiz/rules";
import type { Changeset } from "./changeset";
import type { Checked, Reviewed } from "./rule/rule";
import { Signoff } from "./signoff";

const changeset: Changeset = {
	base: "main",
	changes: [{ path: "src/a.ts", status: "modified", added: ["const a = 1;"] }],
};

const objects: Checked = {
	id: "objects",
	checkedBy: "code",
	document: "# Objects",
	check: (): Finding[] => [{ rule: "objects", message: "it objects" }],
};

const quiet: Checked = {
	id: "quiet",
	checkedBy: "code",
	document: "# Quiet",
	check: (): Finding[] => [],
};

const read: Reviewed = {
	id: "read",
	checkedBy: "agent",
	document: "# Read",
};

describe("Signoff", () => {
	it("ships a change no rule objects to", () => {
		const decision = new Signoff([quiet]).check(changeset);

		expect(decision).toEqual({ ships: true, reasons: [] });
	});

	it("stops a change on one rule's objection, whatever the others say", () => {
		const decision = new Signoff([quiet, objects]).check(changeset);

		expect(decision.ships).toBe(false);
		expect(decision.reasons.map((reason) => reason.rule)).toEqual(["objects"]);
	});

	it("ships when it has no rules at all, having been asked nothing", () => {
		expect(new Signoff([]).check(changeset).ships).toBe(true);
	});

	it("leaves a rule only an agent can settle to the agent", () => {
		// No check to run, so the local pass has nothing to say about it yet.
		expect(new Signoff([read]).check(changeset)).toEqual({
			ships: true,
			reasons: [],
		});
	});
});
