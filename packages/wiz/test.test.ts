import { beforeEach, describe, expect, it } from "bun:test";
import { availableParallelism } from "node:os";
import type { HeavyCap } from "@webappwiz/arbor/heavy";
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

	it("runs only package tests once, from the workspace root", async () => {
		await test({ ...{ package: "", workers: 4 }, fs, ps });

		expect(ps.getCalls()).toEqual([
			"bun test --pass-with-no-tests --parallel=4 --timeout 30000 packages/",
		]);
		expect(ps.getCallDirs()).toEqual(["/tree"]);
	});

	it("runs half the cores' worth of test files at once by default", async () => {
		await test({ ...{ package: "" }, fs, ps });

		const half = Math.max(1, Math.floor(availableParallelism() / 2));
		expect(ps.getCalls()).toEqual([
			`bun test --pass-with-no-tests --parallel=${half} --timeout 30000 packages/`,
		]);
	});

	it("runs in one of the machine's heavy-job slots, which it gives back", async () => {
		const taken: string[] = [];
		const heavy: HeavyCap = {
			take: async ({ what }) => {
				taken.push(what);
				return {
					env: { ARBOR_HEAVY: "1-0" },
					[Symbol.asyncDispose]: async () => {
						taken.push("given back");
					},
				};
			},
			read: async () => ({ cap: 2, running: [], waiting: [] }),
		};

		await test({ ...{ package: "", workers: 4 }, fs, ps, heavy });

		expect(taken).toEqual(["wiz dev test", "given back"]);
		expect(ps.getCallEnvs()).toEqual([{ ARBOR_HEAVY: "1-0" }]);
	});

	it("filters to the named package", async () => {
		await test({ ...{ package: "log", workers: 4 }, fs, ps });

		expect(ps.getCalls()).toEqual([
			"bun test --pass-with-no-tests --parallel=4 --timeout 30000 packages/log/",
		]);
	});

	it("runs eval harness tests only when requested", async () => {
		await test({ package: "", evals: true, workers: 4, fs, ps });

		expect(ps.getCalls()).toEqual([
			"bun test --pass-with-no-tests --parallel=4 --timeout 30000 evals/",
		]);
	});

	it("runs both suites when requested", async () => {
		await test({ package: "", all: true, workers: 4, fs, ps });

		expect(ps.getCalls()).toEqual([
			"bun test --pass-with-no-tests --parallel=4 --timeout 30000",
		]);
	});

	it("rejects competing suite selections before spawning tests", async () => {
		await expect(
			test({ package: "", evals: true, all: true, fs, ps }),
		).rejects.toThrow("choose either --evals or --all");

		expect(ps.getCalls()).toEqual([]);
	});

	it("rejects a package combined with eval tests", async () => {
		await expect(test({ package: "log", evals: true, fs, ps })).rejects.toThrow(
			"a package cannot be combined with --evals or --all",
		);

		expect(ps.getCalls()).toEqual([]);
	});

	it("rejects a package combined with all tests", async () => {
		await expect(test({ package: "log", all: true, fs, ps })).rejects.toThrow(
			"a package cannot be combined with --evals or --all",
		);

		expect(ps.getCalls()).toEqual([]);
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
