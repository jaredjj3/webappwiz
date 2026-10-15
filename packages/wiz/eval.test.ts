import { beforeEach, describe, expect, it } from "bun:test";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { evalSkill } from "./eval";

describe("evalSkill", () => {
	let fs: FakeFs;
	let ps: FakePs;

	beforeEach(async () => {
		fs = new FakeFs();
		ps = new FakePs();
		await fs.write("/tree/package.json", '{"workspaces": ["packages/*"]}');
		await fs.mkdir("/tree/packages/wiz");
		ps.setCwd("/tree/packages/wiz");
	});

	it("runs the evals from the workspace root", async () => {
		await evalSkill({ args: [], fs, ps });

		expect(ps.getCalls()).toEqual(["bun evals/arbor-skill/index.ts run"]);
		expect(ps.getCallDirs()).toEqual(["/tree"]);
	});

	it("runs when led by a version, passing every flag on", async () => {
		await evalSkill({
			args: ["main", "--reps", "5", "--scenario", "lane"],
			fs,
			ps,
		});

		expect(ps.getCalls()).toEqual([
			"bun evals/arbor-skill/index.ts run main --reps 5 --scenario lane",
		]);
	});

	it("reports without running", async () => {
		await evalSkill({ args: ["report", "--reps", "5"], fs, ps });

		expect(ps.getCalls()).toEqual([
			"bun evals/arbor-skill/index.ts report --reps 5",
		]);
	});
});
