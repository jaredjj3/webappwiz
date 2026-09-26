import { beforeEach, describe, expect, it } from "bun:test";
import { ruleDoc } from "@webappwiz/scry/testing";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";
import { update } from "./update";

describe("scry update", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	const rules = {
		"no-foo": { "RULE.md": ruleDoc("no-foo", { version: "1.0.0" }) },
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

	it("says to read a script the refresh changed, and not one it left as it was", async () => {
		const scripted = {
			"no-foo": {
				"RULE.md": ruleDoc("no-foo", { version: "1.0.0" }),
				"scripts/new.sh": "exit 0\n",
				"scripts/same.sh": "exit 0\n",
			},
		};
		await install("no-foo", ruleDoc("no-foo", { version: "0.9.0" }));
		await fs.mkdir("/p/.wiz/scry/no-foo/scripts");
		await fs.write("/p/.wiz/scry/no-foo/scripts/same.sh", "exit 0\n");

		await update({ dir: "/p", log, fs, rules: scripted });

		const warned = log.entries
			.map((entry) => String(entry.message))
			.filter((message) => message.startsWith("⚠️"));
		expect(warned).toEqual([
			"⚠️ .wiz/scry/no-foo/scripts/new.sh is a script that runs on every `wiz scry`: read it before the next one",
		]);
	});
});
