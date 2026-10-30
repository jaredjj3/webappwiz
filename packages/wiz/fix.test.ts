import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { PUBLISH_WORKFLOW_PATH } from "webappwiz/ship";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { fix } from "./fix";
import { publishWorkflow } from "./publish-workflow";

describe("fix", () => {
	let log: MemoryLogger;
	let ps: FakePs;
	let fs: FakeFs;

	beforeEach(async () => {
		log = new MemoryLogger();
		ps = new FakePs();
		fs = new FakeFs();
		await publishWorkflow(fs).write(ps.cwd());
	});

	const run = (check: boolean) => fix({ check, log, ps, fs });

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
		await fix({ check: false, codeOnly: true, log, ps, fs });
		expect(ps.getCalls().at(-1)).toBe(
			"bin/wiz scry check --since main --disable-over-budget --disable som --disable llm",
		);
	});

	it("throws when biome fails, without typechecking", async () => {
		ps.exit(1); // FakePs returns this exit code from every spawn

		await expect(run(false)).rejects.toThrow("Biome check failed");
	});

	it("fails on a publish workflow that has drifted, before running anything", async () => {
		await fs.write(`${ps.cwd()}/${PUBLISH_WORKFLOW_PATH}`, "edited by hand\n");

		await expect(run(true)).rejects.toThrow("is stale");
		expect(ps.getCalls()).toEqual([]);
	});

	it("fails on a missing publish workflow", async () => {
		await fs.rm(`${ps.cwd()}/${PUBLISH_WORKFLOW_PATH}`);

		await expect(run(true)).rejects.toThrow("is missing");
	});
});
