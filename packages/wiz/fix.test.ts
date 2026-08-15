import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakePs } from "@webappwiz/system/testing";

import { fix } from "./fix";

describe("fix", () => {
	let log: MemoryLogger;
	let ps: FakePs;
	let clean: boolean;

	beforeEach(() => {
		log = new MemoryLogger();
		ps = new FakePs();
		clean = true;
	});

	const run = (check: boolean) =>
		fix({ check, checks: { run: async () => clean }, log, ps });

	it("writes fixes by default, then checks and typechecks", async () => {
		await run(false);

		expect(ps.getCalls()).toEqual([
			"bunx biome check --write --unsafe .",
			"bunx tsc --noEmit",
		]);
	});

	it("leaves the tree alone when given --check", async () => {
		await run(true);

		expect(ps.getCalls()).toEqual(["bunx biome check .", "bunx tsc --noEmit"]);
	});

	it("throws when biome fails, without typechecking", async () => {
		ps.exit(1); // FakePs returns this exit code from every spawn

		await expect(run(false)).rejects.toThrow("Biome check failed");
	});

	it("throws when a check fails, without typechecking", async () => {
		clean = false;

		await expect(run(false)).rejects.toThrow("Checks failed");
		expect(ps.getCalls()).toEqual(["bunx biome check --write --unsafe ."]);
	});
});
