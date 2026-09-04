import { beforeEach, describe, expect, it } from "bun:test";
import { ruleDoc } from "@webappwiz/rules/testing";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";
import { update } from "./update";

describe("rules update", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	const rules = { "no-foo": ruleDoc("no-foo", { version: "1.0.0" }) };

	const install = async (id: string, doc: string) => {
		await fs.mkdir(`/p/.wiz/rules/${id}`);
		await fs.write(`/p/.wiz/rules/${id}/RULE.md`, doc);
	};

	beforeEach(() => {
		fs = new FakeFs();
		log = new MemoryLogger();
	});

	it("refreshes the shipped rules the project has copies of", async () => {
		await install("no-foo", ruleDoc("no-foo", { version: "0.9.0" }));

		await update({ dir: "/p", log, fs, rules });

		expect(await fs.read("/p/.wiz/rules/no-foo/RULE.md")).toEqual(
			ruleDoc("no-foo", { version: "1.0.0" }),
		);
	});

	it("leaves the project's own rules alone, and adds nothing", async () => {
		await install("mine", ruleDoc("mine"));

		await update({ dir: "/p", log, fs, rules });

		expect(await fs.read("/p/.wiz/rules/mine/RULE.md")).toEqual(
			ruleDoc("mine"),
		);
		expect(await fs.exists("/p/.wiz/rules/no-foo/RULE.md")).toBe(false);
		expect(log.entries.map((entry) => entry.message)).toEqual([
			"no webappwiz rules in /p: add one with `rules add`",
		]);
	});
});
