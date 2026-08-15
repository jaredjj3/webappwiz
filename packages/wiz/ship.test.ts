import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakeShip, fakePlan } from "@webappwiz/ship/testing";
import { FakePs } from "@webappwiz/system/testing";
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

	beforeEach(() => {
		log = new MemoryLogger();
		ps = new FakePs();
	});

	const opts = (release: FakeShip, bump: string) => ({
		bump,
		release,
		checks: { run: async () => true },
		log,
		ps,
	});

	it("refuses a bump nobody has heard of", async () => {
		const release = new FakeShip(fakePlan());

		await expect(ship(opts(release, "sideways"))).rejects.toThrow(
			'unknown version bump "sideways"',
		);
		expect(ps.getCalls()).toEqual([]);
		expect(release.plans).toBe(0);
	});

	it("runs the command a problem carries, then plans again", async () => {
		const release = new FakeShip(fakePlan([NPM_AUTH]), fakePlan([NPM_AUTH]));

		await expect(ship(opts(release, "patch"))).rejects.toThrow(
			"not ready to release",
		);
		expect(ps.getCalls()).toEqual([...GATE, "npm login"]);
		expect(release.plans).toBe(2);
		expect(release.runs).toEqual([]);
	});

	it("runs nothing for a problem that carries no command", async () => {
		const dirty = { kind: "dirty" as const, message: "uncommitted changes" };
		const release = new FakeShip(fakePlan([dirty]));

		await expect(ship(opts(release, "patch"))).rejects.toThrow(
			"not ready to release",
		);
		expect(ps.getCalls()).toEqual(GATE);
		expect(release.plans).toBe(1);
	});
});
