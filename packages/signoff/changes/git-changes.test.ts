import { beforeEach, describe, expect, it } from "bun:test";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";
import { GitChanges } from "./git-changes";

const NAME_STATUS = [
	"M\tsrc/parse.ts",
	"D\tsrc/old.test.ts",
	"A\tsrc/new.ts",
].join("\n");

const PATCH = [
	"diff --git a/src/parse.ts b/src/parse.ts",
	"--- a/src/parse.ts",
	"+++ b/src/parse.ts",
	"@@ -3,0 +4 @@",
	"+const parsed = 1;",
	"diff --git a/src/old.test.ts b/src/old.test.ts",
	"--- a/src/old.test.ts",
	"+++ /dev/null",
	"@@ -1 +0,0 @@",
	"-it('works', () => {});",
].join("\n");

describe("GitChanges", () => {
	let ps: FakePs;
	let fs: FakeFs;

	// One diff answers for every file, so the fake answers by which git command
	// it was handed rather than replaying a fixed script.
	const answering = (untracked: string) => {
		ps.simulate(async () => {
			const calls = ps.getCalls();
			const call = calls[calls.length - 1] ?? "";
			ps.setCaptureOutput(
				call.includes("--name-status")
					? NAME_STATUS
					: call.includes("ls-files")
						? untracked
						: PATCH,
				"",
			);
			return 0;
		});
	};

	beforeEach(async () => {
		ps = new FakePs();
		fs = new FakeFs();
		await fs.mkdir("/repo");
		answering("");
	});

	const changes = () => new GitChanges(ps, fs, "/repo").since("main");

	it("names every file the change touches, with what happened to it", async () => {
		const { changes: found } = await changes();

		expect(found.map((change) => [change.path, change.status])).toEqual([
			["src/new.ts", "added"],
			["src/old.test.ts", "deleted"],
			["src/parse.ts", "modified"],
		]);
	});

	it("carries the lines a change added, without their leading plus", async () => {
		const { changes: found } = await changes();

		expect(
			found.find((change) => change.path === "src/parse.ts")?.added,
		).toEqual(["const parsed = 1;"]);
	});

	it("adds nothing to a file the change deletes", async () => {
		const { changes: found } = await changes();

		expect(
			found.find((change) => change.path === "src/old.test.ts")?.added,
		).toEqual([]);
	});

	it("counts a file git has never been told about as added, in full", async () => {
		answering("src/fresh.test.ts");
		await fs.write("/repo/src/fresh.test.ts", "it.only('x', () => {});");

		const { changes: found } = await changes();

		expect(found.find((change) => change.path === "src/fresh.test.ts")).toEqual(
			{
				path: "src/fresh.test.ts",
				status: "added",
				added: ["it.only('x', () => {});"],
			},
		);
	});

	it("measures against the ref, so uncommitted work counts", async () => {
		await changes();

		expect(ps.getCalls()[0]).toBe("git -C /repo diff --name-status main");
	});

	it("says what git printed when git fails", async () => {
		ps.exit(128);
		ps.setCaptureOutput("", "fatal: bad revision 'main'");

		await expect(changes()).rejects.toThrow("fatal: bad revision 'main'");
	});
});
