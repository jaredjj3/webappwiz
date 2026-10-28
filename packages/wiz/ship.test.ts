import { beforeEach, describe, expect, it } from "bun:test";
import { catalog } from "@webappwiz/scry/catalog";
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
		"/repo/skills/scry/SKILL.md",
		"/repo/skills/webappwiz/SKILL.md",
		...Object.keys(catalog).map(
			(id) => `/repo/packages/scry/catalog/${id}/RULE.md`,
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

		await ship({ ...opts(), env: {} });

		// A patch would have stamped 1.2.4; RELEASE holding 1.3.0 overrules it.
		expect(JSON.parse(await fs.read("/repo/package.json")).version).toBe(
			"1.3.0",
		);
		expect(await fs.exists("/repo/RELEASE")).toBe(false);
	});

	it("releases at the bump SPLATES_SHIP_BUMP names", async () => {
		await ship({ ...opts(), env: { SPLATES_SHIP_BUMP: "minor" } });

		expect(JSON.parse(await fs.read("/repo/package.json")).version).toBe(
			"1.3.0",
		);
	});

	it("refuses a bump it does not know, before the gate", async () => {
		await expect(
			ship({ ...opts(), env: { SPLATES_SHIP_BUMP: "huge" } }),
		).rejects.toThrow("SPLATES_SHIP_BUMP");

		expect(ps.getCalls()).toEqual([]);
	});

	it("gates before it releases the workspace it found", async () => {
		await ship(opts());

		const calls = ps.getCalls();
		const gate = calls.indexOf(GATE[0] ?? "");
		const push = calls.findIndex((call) =>
			call.startsWith("git -C /repo push origin"),
		);
		expect(push).toBeGreaterThan(-1);
		expect(push).toBeLessThan(gate);
		expect(calls.slice(gate, gate + GATE.length)).toEqual(GATE);
		expect(gate).toBeLessThan(calls.indexOf("npm publish --access public"));
		expect(JSON.parse(await fs.read("/repo/package.json")).version).toBe(
			"1.2.4",
		);
		expect(await fs.exists("/repo/RELEASE")).toBe(false);
	});

	it("carries every skill copy to the version the packages went out at", async () => {
		await ship(opts());

		const stamped = await Promise.all(SKILLS.map((path) => fs.read(path)));

		expect(stamped).toEqual(
			SKILLS.map(() => expect.stringContaining("version: 1.2.4\n")),
		);
	});

	it("stops on a red gate, before anything is stamped", async () => {
		ps.simulate(async () =>
			ps.getCalls().at(-1)?.startsWith("bunx tsc") ? 1 : 0,
		);

		await expect(ship(opts())).rejects.toThrow("Typechecking failed");

		expect(ps.getCalls().slice(-GATE.length)).toEqual(GATE);
		expect(JSON.parse(await fs.read("/repo/package.json")).version).toBe(
			"1.2.3",
		);
	});

	it("reports typecheck as a declared preflight step", async () => {
		ps.setEnv({ WEBAPPWIZ_SHIP_EVENTS: "/repo/events.jsonl" });

		await ship(opts());

		const events = (await fs.read("/repo/events.jsonl"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(
			events.find(
				(event) => event.type === "declared" && event.name === "Typecheck",
			),
		).toMatchObject({ deadlineMs: 600_000 });
		const typechecked = events.findIndex(
			(event) => event.type === "done" && event.name === "Typecheck",
		);
		const versioned = events.findIndex(
			(event) => event.type === "started" && event.name === "Version 1.2.4",
		);
		expect(typechecked).toBeGreaterThan(-1);
		expect(typechecked).toBeLessThan(versioned);
	});
});
