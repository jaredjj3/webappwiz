import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { ship } from "./ship";

describe("ship", () => {
	// The gate runs through the same FakePs the release does, so its commands
	// show up in `getCalls()` ahead of anything the release itself spawns.
	const GATE = [
		"bunx biome check .",
		"bunx tsc --noEmit",
		"bun test --pass-with-no-tests --parallel",
	];

	/** Every skill the release stamps, as `SKILLS` in ship.ts lists them. */
	const SKILLS = ["/repo/packages/cli/templates/arbor.skill.md"];

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
		for (const path of SKILLS) {
			await fs.write(path, "---\nname: arbor\nversion: 1.2.3\n---\n");
		}
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
		await expect(ship(opts("resume"))).rejects.toThrow(
			'unknown version bump "resume" (expected patch, minor)',
		);
		expect(ps.getCalls()).toEqual([]);
	});

	it("refuses major, which would carry every package out of 0.x", async () => {
		await expect(ship(opts("major"))).rejects.toThrow("major would leave 0.x");
		expect(ps.getCalls()).toEqual([]);
		expect(JSON.parse(await fs.read("/repo/package.json")).version).toBe(
			"1.2.3",
		);
	});

	it("finishes a release that failed, at the version RELEASE holds", async () => {
		await fs.write(
			"/repo/RELEASE",
			JSON.stringify({ version: "1.2.4", done: [] }),
		);

		await ship(opts("minor"));

		// 1.3.0 is what the bump asked for; RELEASE holding 1.2.4 overrules it.
		expect(JSON.parse(await fs.read("/repo/package.json")).version).toBe(
			"1.2.4",
		);
		expect(await fs.exists("/repo/RELEASE")).toBe(false);
	});

	it("gates before it releases the workspace it found", async () => {
		await ship(opts("patch"));

		expect(ps.getCalls().slice(0, GATE.length)).toEqual(GATE);
		expect(ps.getCalls()).toContain("bun publish --access public");
		expect(JSON.parse(await fs.read("/repo/package.json")).version).toBe(
			"1.2.4",
		);
		expect(await fs.exists("/repo/RELEASE")).toBe(false);
	});

	it("carries every skill copy to the version the packages went out at", async () => {
		await ship(opts("patch"));

		for (const path of SKILLS) {
			expect(await fs.read(path)).toContain("version: 1.2.4\n");
		}
	});

	it("stops on a red suite, before anything is stamped", async () => {
		ps.simulate(async () =>
			ps.getCalls().at(-1)?.startsWith("bun test") ? 1 : 0,
		);

		await expect(ship(opts("patch"))).rejects.toThrow("Tests failed");

		expect(ps.getCalls()).toEqual(GATE);
		expect(JSON.parse(await fs.read("/repo/package.json")).version).toBe(
			"1.2.3",
		);
	});
});
