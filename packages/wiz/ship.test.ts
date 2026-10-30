import { beforeEach, describe, expect, it } from "bun:test";
import { catalog } from "@webappwiz/scry/catalog";
import { color, MemoryLogger } from "webappwiz/log";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { plan, ship, status } from "./ship";

/**
 * Makes `ps` stage with an id and approve instantly: `npm view` answers only
 * once something has been staged.
 */
function stagesInstantly(ps: FakePs): void {
	const capture = ps.spawnCapture.bind(ps);
	let staged = false;
	ps.spawnCapture = async (argv, opts) => {
		const result = await capture(argv, opts);
		if (argv[1] === "stage") {
			staged = true;
			return {
				...result,
				stdout: "+ @scope/solo@1.2.4 (staged with id st-1)\n",
			};
		}
		return argv[1] === "view" && staged
			? { ...result, stdout: "1.2.4\n" }
			: result;
	};
}

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
		stagesInstantly(ps);
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
		expect(gate).toBeLessThan(
			calls.indexOf("npm stage publish --access public"),
		);
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

	it("prints what each artifact has live, marking what lags", async () => {
		// The reads run at once, so each answers through its own command rather
		// than through one output a sibling could overwrite first.
		const live: Record<string, string> = {
			npm: "1.2.3\n",
			git: "abc123\trefs/tags/v1.2.3\n",
			gh: "v1.2.2\n",
		};
		const read = ps.spawnCapture.bind(ps);
		ps.spawnCapture = async (argv, spawnOpts) => ({
			...(await read(argv, spawnOpts)),
			stdout: live[argv[0] ?? ""] ?? "",
		});

		await status({ log, fs, ps });

		const lines = log.entries.map((entry) => color.strip(entry.message));
		expect(lines).toEqual([
			"workspace 1.2.3",
			"  @scope/solo     1.2.3",
			"  git tag         1.2.3",
			"  GitHub release  1.2.2 (behind)",
		]);
		// Reading publishes nothing and stamps nothing.
		expect(ps.getCalls()).not.toContain("npm stage publish --access public");
	});

	it("plan: prints the steps as JSON and runs none of them", async () => {
		await plan({ log, fs, ps, json: true });

		const printed = JSON.parse(String(log.entries[0]?.message));
		expect(printed.schema).toBe(1);
		expect(printed.version).toBe("1.2.4");
		expect(printed.steps[0].id).toBe("preflight");
		expect(printed.steps.map((step: { name: string }) => step.name)).toContain(
			"Typecheck",
		);
		expect(ps.getCalls()).toEqual([]);
	});

	it("plan: prints a readable list without --json", async () => {
		await plan({ log, fs, ps });

		const said = log.entries.map((entry) => String(entry.message)).join("\n");
		expect(said).toContain("[preflight] Typecheck");
		expect(said).toContain("[tag]");
	});
});
