import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { FakePs } from "webappwiz/system/testing";

import { fix } from "./fix";

describe("fix", () => {
	let log: MemoryLogger;
	let ps: FakePs;

	beforeEach(() => {
		log = new MemoryLogger();
		ps = new FakePs();
	});

	const run = (check: boolean) => fix({ check, log, ps });

	it("writes fixes by default, then typechecks and scries what changed", async () => {
		await run(false);

		expect(ps.getCalls()).toEqual([
			"bunx biome check --write --unsafe .",
			"bunx tsc --noEmit",
			"bin/wiz scry check --since main --disable-over-budget",
		]);
	});

	it("leaves the tree alone when given --check", async () => {
		await run(true);

		expect(ps.getCalls()).toEqual([
			"bunx biome check .",
			"bunx tsc --noEmit",
			"bin/wiz scry check --since main --disable-over-budget",
		]);
	});

	it("disables both model roles explicitly for code-only checks", async () => {
		await fix({ check: false, codeOnly: true, log, ps });
		expect(ps.getCalls().at(-1)).toBe(
			"bin/wiz scry check --since main --disable-over-budget --disable som --disable llm",
		);
	});

	it("throws when biome fails, without typechecking", async () => {
		ps.exit(1); // FakePs returns this exit code from every spawn

		await expect(run(false)).rejects.toThrow("Biome check failed");
	});
});
