import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakePs } from "@webappwiz/sys/testing";

import { Fix } from "./fix";

describe("fix", () => {
	let log: MemoryLogger;
	let ps: FakePs;
	let fix: Fix;

	beforeEach(() => {
		log = new MemoryLogger();
		ps = new FakePs();
		fix = new Fix(log, ps);
	});

	it("writes fixes by default, then typechecks", async () => {
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
});
