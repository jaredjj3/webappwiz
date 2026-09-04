import { beforeEach, describe, expect, it } from "bun:test";
import { ruleDoc } from "@webappwiz/rules/testing";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";
import { add } from "./add";

describe("rules add", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	const rules = { "no-foo": ruleDoc("no-foo"), "no-bar": ruleDoc("no-bar") };

	beforeEach(() => {
		fs = new FakeFs();
		log = new MemoryLogger();
	});

	it("copies the named rule to .wiz/rules/<id>/RULE.md", async () => {
		await add({ dir: "/p", rule: "no-foo", log, fs, rules });

		expect(await fs.read("/p/.wiz/rules/no-foo/RULE.md")).toEqual(
			ruleDoc("no-foo"),
		);
		expect(await fs.exists("/p/.wiz/rules/no-bar/RULE.md")).toBe(false);
	});

	it("rejects a rule that does not ship, and says what there is", async () => {
		await expect(
			add({ dir: "/p", rule: "nope", log, fs, rules }),
		).rejects.toThrow("no such rule: nope (have no-bar, no-foo)");
	});
});
