import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs, FakePs } from "webappwiz/system/testing";

import { add } from "./add";

describe("skills add", () => {
	let fs: FakeFs;
	let ps: FakePs;
	let log: MemoryLogger;

	const adding = (skill: string) => ({
		dir: "/p",
		skill,
		version: "1.0.0",
		skills: ["arbor", "other"],
		log,
		fs,
		ps,
	});

	beforeEach(() => {
		fs = new FakeFs();
		ps = new FakePs();
		log = new MemoryLogger();
	});

	it("installs the named skill, and only it, from the release's tag", async () => {
		await add(adding("arbor"));

		expect(ps.getCalls()).toEqual([
			"bunx skills@1 add jaredjj3/webappwiz#v1.0.0 --yes --skill arbor",
		]);
		expect(ps.getCallDirs()).toEqual(["/p"]);
	});

	it("rejects a skill that does not exist, and says what there is", async () => {
		await expect(add(adding("nope"))).rejects.toThrow(
			"no such skill: nope (have arbor, other)",
		);
		expect(ps.getCalls()).toEqual([]);
	});
});
