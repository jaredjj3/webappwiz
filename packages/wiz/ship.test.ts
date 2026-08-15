import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import type { Bump, Ship } from "@webappwiz/ship";
import { FakeShip } from "@webappwiz/ship/testing";
import { FakePs } from "@webappwiz/system/testing";
import { ship } from "./ship";

describe("ship", () => {
	// The gate runs through the same FakePs the release does, so its commands
	// show up in `getCalls()` ahead of anything the release itself spawns.
	const GATE = ["bunx biome check .", "bunx tsc --noEmit"];

	let log: MemoryLogger;
	let ps: FakePs;
	let shipped: Array<[Ship, Bump]>;

	beforeEach(() => {
		log = new MemoryLogger();
		ps = new FakePs();
		shipped = [];
	});

	const opts = (release: FakeShip, bump: string) => ({
		bump,
		release,
		runner: {
			ship: async (declared: Ship, type: Bump) => {
				shipped.push([declared, type]);
			},
		},
		checks: { run: async () => true },
		log,
		ps,
	});

	it("refuses a bump nobody has heard of", async () => {
		const release = new FakeShip();

		await expect(ship(opts(release, "sideways"))).rejects.toThrow(
			'unknown version bump "sideways"',
		);
		expect(ps.getCalls()).toEqual([]);
		expect(shipped).toEqual([]);
	});

	it("gates before it hands the runner the release", async () => {
		const release = new FakeShip(["@scope/one"]);

		await ship(opts(release, "patch"));

		expect(ps.getCalls()).toEqual(GATE);
		expect(shipped).toEqual([[release, "patch"]]);
	});
});
