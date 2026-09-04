import { beforeEach, describe, expect, it } from "bun:test";
import { ruleDoc } from "@webappwiz/rules/testing";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";
import { add } from "./add";

describe("rules add", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	const rules = {
		"no-foo": ruleDoc("no-foo", { recommended: true }),
		"no-bar": ruleDoc("no-bar"),
	};

	beforeEach(() => {
		fs = new FakeFs();
		log = new MemoryLogger();
	});

	it("copies the named rule to .wiz/rules/<id>/RULE.md", async () => {
		await add({ dir: "/p", rule: "no-bar", log, fs, rules });

		expect(await fs.read("/p/.wiz/rules/no-bar/RULE.md")).toEqual(
			ruleDoc("no-bar"),
		);
		expect(await fs.exists("/p/.wiz/rules/no-foo/RULE.md")).toBe(false);
	});

	it("rejects a rule that does not ship, and says what there is", async () => {
		await expect(
			add({ dir: "/p", rule: "nope", log, fs, rules }),
		).rejects.toThrow("no such rule: nope (have no-bar, no-foo)");
	});

	it("asks for a rule when it is given neither one nor --recommended", async () => {
		await expect(add({ dir: "/p", rule: "", log, fs, rules })).rejects.toThrow(
			"rules add needs a rule id, or --recommended",
		);
	});

	it("copies every recommended rule, and only those", async () => {
		await add({ dir: "/p", rule: "", recommended: true, log, fs, rules });

		expect(await fs.read("/p/.wiz/rules/no-foo/RULE.md")).toEqual(
			rules["no-foo"],
		);
		expect(await fs.exists("/p/.wiz/rules/no-bar/RULE.md")).toBe(false);
	});

	it("reads a lone positional as the project, since --recommended names no rule", async () => {
		await add({ dir: ".", rule: "/p", recommended: true, log, fs, rules });

		expect(await fs.exists("/p/.wiz/rules/no-foo/RULE.md")).toBe(true);
	});

	it("refuses a rule id alongside --recommended, rather than writing to ./<id>", async () => {
		await expect(
			add({ dir: "/p", rule: "no-bar", recommended: true, log, fs, rules }),
		).rejects.toThrow(
			"rules add takes a rule id or --recommended, not both: drop no-bar",
		);
		expect(await fs.exists("no-bar/.wiz/rules/no-foo/RULE.md")).toBe(false);
	});

	it("says so when nothing on offer recommends itself", async () => {
		await add({
			dir: "/p",
			rule: "",
			recommended: true,
			log,
			fs,
			rules: { "no-bar": ruleDoc("no-bar") },
		});

		expect(log.entries.map((entry) => String(entry.message))).toEqual([
			"no rules recommend themselves",
		]);
	});
});
