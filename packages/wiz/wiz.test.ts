import { beforeEach, describe, expect, it } from "bun:test";
import { color, MemoryLogger } from "@webappwiz/log";
import { NodeGlob } from "@webappwiz/system";
import { FakeFs, FakePs } from "@webappwiz/system/testing";
import { FakeClock } from "@webappwiz/time/testing";
import { type WizDeps, wiz } from "./wiz";

describe("wiz", () => {
	let log: MemoryLogger;
	let ps: FakePs;
	let deps: WizDeps;

	beforeEach(async () => {
		log = new MemoryLogger();
		ps = new FakePs();
		const fs = new FakeFs();
		await fs.mkdir("/w");
		await fs.write("/w/package.json", JSON.stringify({ workspaces: ["p/*"] }));
		ps.setCwd("/w");
		deps = { log, fs, ps, clock: new FakeClock(), glob: new NodeGlob() };
	});

	const out = () =>
		log.entries.map((entry) => color.strip(entry.message)).join("\n");

	it("lists its commands, the mounted cli group included", () => {
		wiz.run(deps, []);

		expect(out()).toContain("Usage: wiz <command> [options]");
		expect(out()).toContain("fix   format, check, and typecheck the workspace");
		expect(out()).toContain("run @webappwiz/cli against a project");
	});

	// Nothing here touches the real filesystem: the action reads the workspace
	// off the FakeFs it was run with, and refuses there.
	it("runs a command against the dependencies it is given", async () => {
		await wiz.run(deps, ["test", "nope"]);

		expect(out()).toContain("error: no such package: nope");
		expect(ps.getExitCode()).toBe(1);
	});
});
