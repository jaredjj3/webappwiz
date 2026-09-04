import { beforeEach, describe, expect, it } from "bun:test";
import { Rule } from "@webappwiz/rules";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";
import { newRule } from "./new";

describe("rules new", () => {
	let fs: FakeFs;
	let log: MemoryLogger;

	beforeEach(() => {
		fs = new FakeFs();
		log = new MemoryLogger();
	});

	it("writes a rule that already parses, under its own directory", async () => {
		await newRule({ name: "no-default-exports", dir: "/p", log, fs });

		const doc = await fs.read("/p/.wiz/rules/no-default-exports/RULE.md");
		expect(Rule.parse(doc, { id: "no-default-exports" }).id).toEqual(
			"no-default-exports",
		);
		expect(log.entries.map((entry) => entry.message)).toEqual([
			"wrote /p/.wiz/rules/no-default-exports/RULE.md",
		]);
	});

	it("refuses to overwrite a rule that is already there", async () => {
		await fs.mkdir("/p/.wiz/rules/no-foo");
		await fs.write("/p/.wiz/rules/no-foo/RULE.md", "mine");

		await expect(
			newRule({ name: "no-foo", dir: "/p", log, fs }),
		).rejects.toThrow("/p/.wiz/rules/no-foo/RULE.md already exists");
		expect(await fs.read("/p/.wiz/rules/no-foo/RULE.md")).toEqual("mine");
	});

	it("refuses a name that would not be a rule id, writing nothing", async () => {
		await expect(
			newRule({ name: "No Foo", dir: "/p", log, fs }),
		).rejects.toThrow('"No Foo" is not kebab case');
		expect(await fs.exists("/p/.wiz/rules/No Foo")).toBe(false);
	});
});
