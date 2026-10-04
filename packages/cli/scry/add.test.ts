import { beforeEach, describe, expect, it } from "bun:test";
import { ruleDoc } from "@webappwiz/scry/testing";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";
import { add } from "./add";

describe("scry add", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	const recommended = class {
		static description = "Recommended.";
		static recommended = true;
		async check() {
			return [];
		}
	};
	const optional = class {
		static description = "Optional.";
		async check() {
			return [];
		}
	};
	const rules = {
		"no-foo": { rule: recommended, files: { "RULE.md": ruleDoc("no-foo") } },
		"no-bar": { rule: optional, files: { "RULE.md": ruleDoc("no-bar") } },
	};

	beforeEach(() => {
		fs = new FakeFs();
		log = new MemoryLogger();
	});

	it("copies the named rule to .wiz/scry/<id>/RULE.md", async () => {
		await add({ dir: "/p", rule: "no-bar", log, fs, rules });

		expect(await fs.read("/p/.wiz/scry/no-bar/RULE.md")).toEqual(
			ruleDoc("no-bar"),
		);
		expect(await fs.exists("/p/.wiz/scry/no-foo/RULE.md")).toBe(false);
	});

	it("rejects a rule that does not ship, and says what there is", async () => {
		await expect(
			add({ dir: "/p", rule: "nope", log, fs, rules }),
		).rejects.toThrow("no such rule: nope (have no-bar, no-foo)");
	});

	it("asks for a rule when it is given neither one nor --recommended", async () => {
		await expect(add({ dir: "/p", rule: "", log, fs, rules })).rejects.toThrow(
			"scry add needs a rule id, or --recommended",
		);
	});

	it("copies every recommended rule, and only those", async () => {
		await add({ dir: "/p", rule: "", recommended: true, log, fs, rules });

		expect(await fs.read("/p/.wiz/scry/no-foo/RULE.md")).toEqual(
			rules["no-foo"].files["RULE.md"],
		);
		expect(await fs.exists("/p/.wiz/scry/no-bar/RULE.md")).toBe(false);
	});

	it("reads a lone positional as the project, since --recommended names no rule", async () => {
		await add({ dir: ".", rule: "/p", recommended: true, log, fs, rules });

		expect(await fs.exists("/p/.wiz/scry/no-foo/RULE.md")).toBe(true);
	});

	it("refuses a rule id alongside --recommended, rather than writing to ./<id>", async () => {
		await expect(
			add({ dir: "/p", rule: "no-bar", recommended: true, log, fs, rules }),
		).rejects.toThrow(
			"scry add takes a rule id or --recommended, not both: drop no-bar",
		);
		expect(await fs.exists("no-bar/.wiz/scry/no-foo/RULE.md")).toBe(false);
	});

	it("says so when nothing on offer recommends itself", async () => {
		await add({
			dir: "/p",
			rule: "",
			recommended: true,
			log,
			fs,
			rules: { "no-bar": rules["no-bar"] },
		});

		expect(log.entries.map((entry) => String(entry.message))).toEqual([
			"no rules recommend themselves",
		]);
	});

	it("copies a rule's code beside it, and says to read it", async () => {
		const coded = {
			"no-baz": {
				rule: optional,
				files: {
					"RULE.md": ruleDoc("no-baz"),
					"rule.ts": "export default class {}\n",
				},
			},
		};

		await add({ dir: "/p", rule: "no-baz", log, fs, rules: coded });

		expect(await fs.read("/p/.wiz/scry/no-baz/rule.ts")).toEqual(
			"export default class {}\n",
		);
		expect(log.entries.map((entry) => String(entry.message))).toContain(
			"⚠️ .wiz/scry/no-baz/rule.ts is code that runs on every `wiz scry`: read it before the next one",
		);
	});

	it("says to add @webappwiz/scry when package.json lacks it, since a rule's tests import it", async () => {
		await fs.write("/p/package.json", JSON.stringify({ name: "p" }));

		await add({ dir: "/p", rule: "no-bar", log, fs, rules });

		expect(log.entries.map((entry) => String(entry.message))).toContain(
			"⚠️ a rule's tests import @webappwiz/scry, which package.json does not list: add it as a devDependency",
		);
	});

	it("says nothing of @webappwiz/scry once it is a dependency or a devDependency", async () => {
		await fs.write(
			"/p/package.json",
			JSON.stringify({ devDependencies: { "@webappwiz/scry": "^1.0.0" } }),
		);
		await fs.write(
			"/q/package.json",
			JSON.stringify({ dependencies: { "@webappwiz/scry": "^1.0.0" } }),
		);

		await add({ dir: "/p", rule: "no-bar", log, fs, rules });
		await add({ dir: "/q", rule: "", recommended: true, log, fs, rules });

		expect(log.entries.map((entry) => String(entry.message))).toEqual([
			"wrote /p/.wiz/scry/no-bar/RULE.md",
			"wrote /q/.wiz/scry/no-foo/RULE.md",
		]);
	});
});
