import { beforeEach, describe, expect, it } from "bun:test";
import { ruleDoc } from "@webappwiz/scry/testing";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { update } from "./update";

describe("scry update", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	let ps: FakePs;
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
		ps = new FakePs();
		ps.setEnv({ HOME: "/home" });
	});

	it("refreshes the shipped rules the project has copies of", async () => {
		await install("no-foo", ruleDoc("no-foo", { version: "0.9.0" }));

		await update({ dir: "/p", log, fs, ps, rules });

		expect(await fs.read("/p/.wiz/scry/no-foo/RULE.md")).toEqual(
			ruleDoc("no-foo", { version: "1.0.0" }),
		);
	});

	it("leaves the project's own rules alone, and adds nothing", async () => {
		await install("mine", ruleDoc("mine"));

		await update({ dir: "/p", log, fs, ps, rules });

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

		await update({ dir: "/p", log, fs, ps, rules: coded });

		const warned = log.entries
			.map((entry) => String(entry.message))
			.filter((message) => message.startsWith("⚠️"));
		expect(warned).toEqual([
			"⚠️ .wiz/scry/no-foo/rule.ts is code that runs on every `wiz scry`: read it before the next one",
		]);
	});

	it("moves .wiz/rules to .wiz/scry, rules and all", async () => {
		await fs.mkdir("/p/.wiz/rules/mine", { recursive: true });
		await fs.write("/p/.wiz/rules/mine/RULE.md", "mine");

		await update({ dir: "/p", log, fs, ps, rules });

		expect(await fs.read("/p/.wiz/scry/mine/RULE.md")).toEqual("mine");
		expect(await fs.exists("/p/.wiz/rules")).toBe(false);
	});

	it("leaves .wiz/rules alone when .wiz/scry already exists, and says so", async () => {
		await fs.mkdir("/p/.wiz/rules/old", { recursive: true });
		await fs.write("/p/.wiz/rules/old/RULE.md", "old");
		await install("new", ruleDoc("new"));

		await update({ dir: "/p", log, fs, ps, rules });

		expect(await fs.read("/p/.wiz/rules/old/RULE.md")).toEqual("old");
		expect(log.entries.map((entry) => String(entry.message))).toContain(
			"/p/.wiz/rules and /p/.wiz/scry both exist: move what you still want from /p/.wiz/rules by hand",
		);
	});

	it("moves scry's settings out of the project's wiz config and the user's", async () => {
		await fs.mkdir("/p/.wiz", { recursive: true });
		await fs.write(
			"/p/.wiz/config.ts",
			"export default { scry: { jobs: 2 } };\n",
		);
		await fs.mkdir("/home/.config/wiz", { recursive: true });
		await fs.write(
			"/home/.config/wiz/config.ts",
			"export default { scry: { jobs: 4 } };\n",
		);

		await update({ dir: "/p", log, fs, ps, rules });

		expect([
			await fs.read("/p/scry.config.ts"),
			await fs.read("/home/.config/scry/config.ts"),
		]).toEqual([
			"export default { jobs: 2 };\n",
			"export default { jobs: 4 };\n",
		]);
	});

	it("refreshes the scry skill when the project has it, and no other", async () => {
		for (const name of ["arbor", "scry"]) {
			await fs.mkdir(`/p/.agents/skills/${name}`, { recursive: true });
			await fs.write(`/p/.agents/skills/${name}/SKILL.md`, `# ${name}\n`);
		}

		await update({ dir: "/p", log, fs, ps, rules, version: "1.0.0" });

		expect(ps.getCalls()).toEqual([
			"bunx skills@1 add jaredjj3/webappwiz#v1.0.0 --yes --skill scry",
		]);
	});
});
