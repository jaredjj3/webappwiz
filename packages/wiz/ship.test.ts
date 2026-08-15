import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakeShip, fakePlan } from "@webappwiz/ship";
import { FakePs } from "@webappwiz/sys/testing";
import { Fixer } from "./fixer";
import { ship } from "./ship";

describe("ship", () => {
	const NPM_AUTH = {
		kind: "npm-auth" as const,
		message: "not logged in to npm",
		remedy: ["npm", "login"],
	};

	// The gate runs through the same FakePs the release does, so its commands
	// show up in `getCalls()` ahead of anything the release itself spawns.
	const GATE = ["bunx biome check .", "bunx tsc --noEmit"];

	let log: MemoryLogger;
	let ps: FakePs;
	let fix: Fixer;

	beforeEach(() => {
		log = new MemoryLogger();
		ps = new FakePs();
		fix = new Fixer({ run: async () => true }, { log, ps });
	});

	it("refuses a bump nobody has heard of", async () => {
		const release = new FakeShip(fakePlan());

		await expect(
			ship(release, fix, { ...{ bump: "sideways" }, log, ps }),
		).rejects.toThrow('unknown version bump "sideways"');
		expect(ps.getCalls()).toEqual([]);
		expect(release.plans).toBe(0);
	});

	it("runs the command a problem carries, then plans again", async () => {
		const release = new FakeShip(fakePlan([NPM_AUTH]), fakePlan([NPM_AUTH]));

		await expect(
			ship(release, fix, { ...{ bump: "patch" }, log, ps }),
		).rejects.toThrow("not ready to release");
		expect(ps.getCalls()).toEqual([...GATE, "npm login"]);
		expect(release.plans).toBe(2);
		expect(release.runs).toEqual([]);
	});

	it("runs nothing for a problem that carries no command", async () => {
		const dirty = { kind: "dirty" as const, message: "uncommitted changes" };
		const release = new FakeShip(fakePlan([dirty]));

		await expect(
			ship(release, fix, { ...{ bump: "patch" }, log, ps }),
		).rejects.toThrow("not ready to release");
		expect(ps.getCalls()).toEqual(GATE);
		expect(release.plans).toBe(1);
	});
});
