import { beforeEach, describe, expect, it } from "bun:test";
import { availableParallelism } from "node:os";
import { FakeFs, FakePs } from "webappwiz/system/testing";

import { test } from "./test";

describe("test", () => {
	let fs: FakeFs;
	let ps: FakePs;

	beforeEach(async () => {
		fs = new FakeFs();
		ps = new FakePs();
		await fs.write("/tree/package.json", '{"workspaces": ["packages/*"]}');
		await fs.mkdir("/tree/packages/system");
		await fs.mkdir("/tree/packages/log");
		ps.setCwd("/tree");
	});

	it("runs bun test once, from the workspace root", async () => {
		await test({ ...{ package: "", workers: 4 }, fs, ps });

		expect(ps.getCalls()).toEqual([
			"bun test --pass-with-no-tests --parallel=4 --timeout 30000",
		]);
		expect(ps.getCallDirs()).toEqual(["/tree"]);
	});

	it("runs half the cores' worth of test files at once by default", async () => {
		await test({ ...{ package: "" }, fs, ps });

		const half = Math.max(1, Math.floor(availableParallelism() / 2));
		expect(ps.getCalls()).toEqual([
			`bun test --pass-with-no-tests --parallel=${half} --timeout 30000`,
		]);
	});

	it("filters to the named package", async () => {
		await test({ ...{ package: "log", workers: 4 }, fs, ps });

		expect(ps.getCalls()).toEqual([
			"bun test --pass-with-no-tests --parallel=4 --timeout 30000 packages/log/",
		]);
	});

	it("rejects a package that does not exist", async () => {
		await expect(test({ ...{ package: "nope" }, fs, ps })).rejects.toThrow(
			"no such package: nope",
		);
		expect(ps.getCalls()).toEqual([]);
	});

	it("fails when bun test fails", async () => {
		ps.exit(1); // FakePs returns this exit code from every spawn

		await expect(test({ ...{ package: "" }, fs, ps })).rejects.toThrow(
			"Tests failed",
		);
	});

	it("climbs to the workspace root when run from inside a package", async () => {
		ps.setCwd("/tree/packages/log");

		await test({ ...{ package: "log" }, fs, ps });

		expect(ps.getCallDirs()).toEqual(["/tree"]);
	});

	it("tests the checkout it is run in, not the one wiz came from", async () => {
		// a git worktree: the same workspace, a second copy of it on disk
		await fs.write("/worktree/package.json", '{"workspaces": ["packages/*"]}');
		await fs.mkdir("/worktree/packages/log");
		ps.setCwd("/worktree");

		await test({ ...{ package: "log" }, fs, ps });

		expect(ps.getCallDirs()).toEqual(["/worktree"]);
	});

	it("stays where it stands when nothing above declares a workspace", async () => {
		await fs.mkdir("/loose/packages/log");
		ps.setCwd("/loose");

		await test({ ...{ package: "log" }, fs, ps });

		expect(ps.getCallDirs()).toEqual(["/loose"]);
	});

	it("climbs past a package.json that declares no workspaces", async () => {
		await fs.write("/tree/packages/log/package.json", '{"name": "log"}');
		ps.setCwd("/tree/packages/log");

		await test({ ...{ package: "log" }, fs, ps });

		expect(ps.getCallDirs()).toEqual(["/tree"]);
	});
});
