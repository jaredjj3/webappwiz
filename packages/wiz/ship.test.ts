import { beforeEach, describe, expect, it } from "bun:test";
import { catalog } from "@webappwiz/rules/catalog";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { ship } from "./ship";

describe("ship", () => {
	// The gate runs through the same FakePs the release does, so its commands
	// show up in `getCalls()` ahead of anything the release itself spawns.
	const GATE = ["bunx biome check .", "bunx tsc --noEmit"];

	/** Every document the release stamps: the skills `SKILLS` in ship.ts
	 * lists, and every rule the catalog ships. */
	const SKILLS = [
		"/repo/packages/cli/templates/arbor.skill.md",
		"/repo/packages/cli/templates/review.skill.md",
		"/repo/packages/cli/templates/webappwiz.skill.md",
		...Object.keys(catalog).map(
			(id) => `/repo/packages/rules/catalog/${id}/RULE.md`,
		),
	];

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
			await fs.write(path, "---\nversion: 1.2.3\n---\n");
		}
	});

	const opts = () => ({
		prompt: () => "y",
		log,
		fs,
		ps,
	});

	it("finishes a release that failed, at the version RELEASE holds", async () => {
		await fs.write(
			"/repo/RELEASE",
			JSON.stringify({ version: "1.3.0", done: [] }),
		);

		await ship(opts());

		// A patch would have stamped 1.2.4; RELEASE holding 1.3.0 overrules it.
		expect(JSON.parse(await fs.read("/repo/package.json")).version).toBe(
			"1.3.0",
		);
		expect(await fs.exists("/repo/RELEASE")).toBe(false);
	});

	it("gates before it releases the workspace it found", async () => {
		await ship(opts());

		expect(ps.getCalls().slice(0, GATE.length)).toEqual(GATE);
		expect(ps.getCalls()).toContain("bun publish --access public");
		expect(JSON.parse(await fs.read("/repo/package.json")).version).toBe(
			"1.2.4",
		);
		expect(await fs.exists("/repo/RELEASE")).toBe(false);
	});

	it("carries every skill copy to the version the packages went out at", async () => {
		await ship(opts());

		for (const path of SKILLS) {
			expect(await fs.read(path)).toContain("version: 1.2.4\n");
		}
	});

	it("stops on a red gate, before anything is stamped", async () => {
		ps.simulate(async () =>
			ps.getCalls().at(-1)?.startsWith("bunx tsc") ? 1 : 0,
		);

		await expect(ship(opts())).rejects.toThrow("Typechecking failed");

		expect(ps.getCalls()).toEqual(GATE);
		expect(JSON.parse(await fs.read("/repo/package.json")).version).toBe(
			"1.2.3",
		);
	});
});
