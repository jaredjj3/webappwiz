import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakePs } from "@webappwiz/sys/testing";

import { Fix } from "./fix";

describe("fix", () => {
	let log: MemoryLogger;
	let ps: FakePs;
	let clean: boolean;
	let fix: Fix;

	beforeEach(() => {
		log = new MemoryLogger();
		ps = new FakePs();
		clean = true;
		fix = new Fix(log, ps, { run: async () => clean });
	});

	it("writes fixes by default, then lints and typechecks", async () => {
		await fix.run({ check: false });

		expect(ps.getCalls()).toEqual([
			"bunx biome check --write --unsafe .",
			"bunx tsc --noEmit",
		]);
	});

	it("leaves the tree alone when given --check", async () => {
		await fix.run({ check: true });

		expect(ps.getCalls()).toEqual(["bunx biome check .", "bunx tsc --noEmit"]);
	});

	it("throws when biome fails, without typechecking", async () => {
		ps.exit(1); // FakePs returns this exit code from every spawn

		await expect(fix.run({ check: false })).rejects.toThrow(
			"Biome check failed",
		);
	});

	it("throws when lint fails, without typechecking", async () => {
		clean = false;

		await expect(fix.run({ check: false })).rejects.toThrow("Lint failed");
		expect(ps.getCalls()).toEqual(["bunx biome check --write --unsafe ."]);
	});
});
