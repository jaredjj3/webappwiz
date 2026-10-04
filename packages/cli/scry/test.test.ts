import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryLogger } from "webappwiz/log";
import {
	NodeFs,
	NodePs,
	type SpawnOptions,
	type SpawnResult,
} from "webappwiz/system";
import { FakeProcess } from "webappwiz/system/testing";
import { test as testRules } from "./test";

/** Runs commands for real, but keeps their output, so the inner bun's report stays out of this one's. */
class QuietPs extends NodePs {
	override async spawn(
		argv: string[],
		opts?: SpawnOptions,
	): Promise<SpawnResult> {
		const { exitCode } = await this.spawnCapture(argv, opts);
		return { exitCode };
	}
}

describe("wiz scry test", () => {
	const fs = new NodeFs();
	let root: string;
	let proc: FakeProcess;
	let ps: QuietPs;
	let log: MemoryLogger;

	const write = async (path: string, text: string) => {
		await fs.mkdir(`${root}/${path.slice(0, path.lastIndexOf("/"))}`);
		await fs.write(`${root}/${path}`, text);
	};

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "scry-test-"));
		proc = new FakeProcess();
		proc.env = { PATH: process.env.PATH, HOME: root };
		ps = new QuietPs({ proc });
		proc.chdir(root);
		log = new MemoryLogger();
		await ps.spawnCapture(["git", "-C", root, "init", "-q"]);
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("runs the tests beside the rules, which bun alone would skip", async () => {
		await write(
			".wiz/scry/passes/rule.test.ts",
			'import { test } from "bun:test";\ntest("passes", () => {});\n',
		);

		await testRules({ ids: [], log, fs, ps });

		expect(proc.exits).toEqual([]);
	});

	it("exits as bun does when a test fails, from anywhere in the project", async () => {
		await write(
			".wiz/scry/fails/rule.test.ts",
			'import { test } from "bun:test";\ntest("fails", () => { throw new Error("no"); });\n',
		);
		await fs.mkdir(`${root}/src`);
		proc.chdir(`${root}/src`);

		await testRules({ ids: [], log, fs, ps });

		expect(proc.exits).toEqual([1]);
	});

	it("runs only the rules it is given", async () => {
		await write(
			".wiz/scry/passes/rule.test.ts",
			'import { test } from "bun:test";\ntest("passes", () => {});\n',
		);
		await write(
			".wiz/scry/fails/rule.test.ts",
			'import { test } from "bun:test";\ntest("fails", () => { throw new Error("no"); });\n',
		);

		await testRules({ ids: ["passes"], log, fs, ps });

		expect(proc.exits).toEqual([]);
	});

	it("says so when there are no tests", async () => {
		await write(".wiz/scry/untested/RULE.md", "---\n---\n");

		await testRules({ ids: [], log, fs, ps });

		expect(log.entries.map((entry) => entry.message)).toEqual([
			"no tests in .wiz/scry",
		]);
	});

	it("refuses a rule that is not there", async () => {
		await expect(testRules({ ids: ["nope"], log, fs, ps })).rejects.toThrow(
			'no rule "nope" in .wiz/scry',
		);
	});
});
