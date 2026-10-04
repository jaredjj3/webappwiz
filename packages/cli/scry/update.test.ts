import { beforeEach, describe, expect, it } from "bun:test";
import { ruleDoc } from "@webappwiz/scry/testing";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";
import { update } from "./update";

describe("scry update", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	const rule = class {
		static description = "No foo.";
		async check() {
			return [];
		}
	};
	const rules = {
		"no-foo": {
			rule,
			files: { "RULE.md": ruleDoc("no-foo", { version: "1.0.0" }) },
		},
	};

	const install = async (id: string, doc: string) => {
		await fs.mkdir(`/p/.wiz/scry/${id}`);
		await fs.write(`/p/.wiz/scry/${id}/RULE.md`, doc);
	};

	beforeEach(() => {
		fs = new FakeFs();
		log = new MemoryLogger();
	});

	it("refreshes the shipped rules the project has copies of", async () => {
		await install("no-foo", ruleDoc("no-foo", { version: "0.9.0" }));

		await update({ dir: "/p", log, fs, rules });

		expect(await fs.read("/p/.wiz/scry/no-foo/RULE.md")).toEqual(
			ruleDoc("no-foo", { version: "1.0.0" }),
		);
	});

	it("leaves the project's own rules alone, and adds nothing", async () => {
		await install("mine", ruleDoc("mine"));

		await update({ dir: "/p", log, fs, rules });

		expect(await fs.read("/p/.wiz/scry/mine/RULE.md")).toEqual(ruleDoc("mine"));
		expect(await fs.exists("/p/.wiz/scry/no-foo/RULE.md")).toBe(false);
		expect(log.entries.map((entry) => entry.message)).toEqual([
			"no webappwiz rules in /p: add one with `scry add`",
		]);
	});

	it("says to read code the refresh changed, and not code it left as it was, nor tests", async () => {
		const coded = {
			"no-foo": {
				rule,
				files: {
					"RULE.md": ruleDoc("no-foo", { version: "1.0.0" }),
					"rule.ts": "export default class {}\n",
					"words.ts": "export const WORDS = [];\n",
					"rule.test.ts": "test();\n",
				},
			},
		};
		await install("no-foo", ruleDoc("no-foo", { version: "0.9.0" }));
		await fs.write(
			"/p/.wiz/scry/no-foo/words.ts",
			"export const WORDS = [];\n",
		);

		await update({ dir: "/p", log, fs, rules: coded });

		const warned = log.entries
			.map((entry) => String(entry.message))
			.filter((message) => message.startsWith("⚠️"));
		expect(warned).toEqual([
			"⚠️ .wiz/scry/no-foo/rule.ts is code that runs on every `wiz scry`: read it before the next one",
		]);
	});
});
