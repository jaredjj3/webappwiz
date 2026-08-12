import { MemoryLogger } from "@webappwiz/log";
import type { Plan } from "@webappwiz/ship";
import { FakePs } from "@webappwiz/sys/testing";
import { ship } from "./ship";

/** The one problem in these tests that carries a command to clear it. */
export const NPM_AUTH = {
	kind: "npm-auth" as const,
	message: "not logged in to npm",
	remedy: ["npm", "login"],
};

/** A 1.2.3 to 1.2.4 patch release of nothing, blocked by `problems`. */
export function plan(problems: Plan["problems"]): Plan {
	return {
		bump: "patch",
		current: "1.2.3",
		next: "1.2.4",
		resuming: false,
		packages: [],
		problems,
	};
}

/** Answers with each plan in turn, so a re-plan can differ from the first. */
function fakeRelease(...plans: Plan[]) {
	return {
		plans: 0,
		runs: [] as Plan[],
		async plan(): Promise<Plan> {
			return plans[this.plans++] ?? plans[plans.length - 1] ?? plan([]);
		},
		async run(approved: Plan): Promise<void> {
			this.runs.push(approved);
		},
	};
}

/**
 * `ship` wired to a fake release and a fix that does nothing. Say what the
 * release will answer with `planning`, then call `run`; `release` records how
 * many plans were asked for and which ones were run.
 */
export class ShipHarness {
	readonly log = new MemoryLogger();
	readonly ps = new FakePs();
	readonly fix = { async run(): Promise<void> {} };
	release = fakeRelease();

	/** The plans the release answers with, in order. */
	planning(...plans: Plan[]): this {
		this.release = fakeRelease(...plans);
		return this;
	}

	run(bump: string): Promise<void> {
		return ship(this.log, this.ps, this.release, this.fix, { bump });
	}
}
