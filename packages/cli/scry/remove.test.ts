import { beforeEach, describe, expect, it } from "bun:test";
import { ruleDoc } from "@webappwiz/scry/testing";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";
import { remove } from "./remove";

describe("scry remove", () => {
	let fs: FakeFs;
	let log: MemoryLogger;

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		await fs.mkdir("/p/.wiz/scry/no-foo/scripts");
		await fs.write("/p/.wiz/scry/no-foo/RULE.md", ruleDoc("no-foo"));
		await fs.write("/p/.wiz/scry/no-foo/scripts/check.sh", "#!/bin/sh\n");
	});

	it("deletes the rule's directory, scripts and all", async () => {
		await remove({ dir: "/p", rule: "no-foo", log, fs });

		expect(await fs.exists("/p/.wiz/scry/no-foo")).toBe(false);
		expect(log.entries.map((entry) => entry.message)).toEqual([
			"removed .wiz/scry/no-foo",
		]);
	});

	it("refuses a rule the project does not have", async () => {
		await expect(remove({ dir: "/p", rule: "nope", log, fs })).rejects.toThrow(
			"no rule nope in /p/.wiz/scry",
		);
	});
});
