import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakeGit, FakeRelease, FakeWorkspace } from "@webappwiz/ship/testing";
import { FakePs } from "@webappwiz/system/testing";
import { ship } from "./ship";

describe("ship", () => {
	// The gate runs through the same FakePs the release does, so its commands
	// show up in `getCalls()` ahead of anything the release itself spawns.
	const GATE = ["bunx biome check .", "bunx tsc --noEmit"];

	let log: MemoryLogger;
	let ps: FakePs;
	let git: FakeGit;

	beforeEach(() => {
		log = new MemoryLogger();
		ps = new FakePs();
		git = new FakeGit();
	});

	const opts = (release: FakeRelease, bump: string) => ({
		bump,
		release,
		checks: { run: async () => true },
		workspace: new FakeWorkspace([
			{ name: "@scope/one", dir: "/repo/packages/one", private: false },
		]),
		git,
		prompt: () => "y",
		log,
		ps,
	});

	it("refuses a bump nobody has heard of", async () => {
		const release = new FakeRelease(["@scope/one"]);

		await expect(ship(opts(release, "sideways"))).rejects.toThrow(
			'unknown version bump "sideways"',
		);
		expect(ps.getCalls()).toEqual([]);
		expect(release.cuts).toEqual([]);
	});

	it("gates before the release goes out", async () => {
		const release = new FakeRelease(["@scope/one"]);
		// The fake publishes nothing, so stand in for the tag its git part would
		// have pushed; a release without one is refused.
		git.tags.add("v1.2.4");

		await ship(opts(release, "patch"));

		expect(ps.getCalls()).toEqual(GATE);
		expect(release.cuts.map((cut) => cut.version)).toEqual(["1.2.4"]);
	});
});
