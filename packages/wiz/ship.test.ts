import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakeFs, FakePs } from "@webappwiz/system/testing";
import { ship } from "./ship";

describe("ship", () => {
	// The gate runs through the same FakePs the release does, so its commands
	// show up in `getCalls()` ahead of anything the release itself spawns.
	const GATE = ["bunx biome check .", "bunx tsc --noEmit"];

	let log: MemoryLogger;
	let ps: FakePs;
	let fs: FakeFs;

	beforeEach(async () => {
		log = new MemoryLogger();
		ps = new FakePs();
		ps.setCwd("/repo");
		fs = new FakeFs();
		await fs.mkdir("/repo");
		await fs.write(
			"/repo/package.json",
			JSON.stringify({ name: "@scope/solo", version: "1.2.3" }),
		);
	});

	const opts = (bump: string) => ({
		bump,
		checks: { run: async () => true },
		prompt: () => "y",
		log,
		fs,
		ps,
	});

	it("refuses a bump nobody has heard of", async () => {
		await expect(ship(opts("sideways"))).rejects.toThrow(
			'unknown version bump "sideways"',
		);
		expect(ps.getCalls()).toEqual([]);
	});

	it("finishes a release that failed, at the version already stamped", async () => {
		await ship(opts("resume"));

		expect(JSON.parse(await fs.read("/repo/package.json")).version).toBe(
			"1.2.3",
		);
	});

	it("gates before it releases the workspace it found", async () => {
		await ship(opts("patch"));

		expect(ps.getCalls().slice(0, GATE.length)).toEqual(GATE);
		expect(ps.getCalls()).toContain("bun publish --access public");
		expect(JSON.parse(await fs.read("/repo/package.json")).version).toBe(
			"1.2.4",
		);
	});
});
