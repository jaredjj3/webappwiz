import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import type { Plan } from "@webappwiz/ship";
import { FakePs } from "@webappwiz/sys/testing";
import { ship } from "./ship";

const NPM_AUTH = {
	kind: "npm-auth" as const,
	message: "not logged in to npm",
	remedy: ["npm", "login"],
};

function plan(problems: Plan["problems"]): Plan {
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

const fix = { async run(): Promise<void> {} };

let log: MemoryLogger;
let ps: FakePs;

beforeEach(() => {
	log = new MemoryLogger();
	ps = new FakePs();
});

describe("ship", () => {
	it("refuses a bump nobody has heard of", async () => {
		const release = fakeRelease(plan([]));
		await expect(
			ship(log, ps, release, fix, { bump: "sideways" }),
		).rejects.toThrow('unknown version bump "sideways"');
		expect(release.plans).toBe(0);
	});

	it("runs the command a problem carries, then plans again", async () => {
		const release = fakeRelease(plan([NPM_AUTH]), plan([NPM_AUTH]));
		await expect(
			ship(log, ps, release, fix, { bump: "patch" }),
		).rejects.toThrow("not ready to release");
		expect(ps.getCalls()).toEqual(["npm login"]);
		expect(release.plans).toBe(2);
		expect(release.runs).toEqual([]);
	});

	it("runs nothing for a problem that carries no command", async () => {
		const dirty = { kind: "dirty" as const, message: "uncommitted changes" };
		const release = fakeRelease(plan([dirty]));
		await expect(
			ship(log, ps, release, fix, { bump: "patch" }),
		).rejects.toThrow("not ready to release");
		expect(ps.getCalls()).toEqual([]);
		expect(release.plans).toBe(1);
	});
});
