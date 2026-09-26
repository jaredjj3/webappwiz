import { beforeEach, describe, expect, it } from "bun:test";
import { FakeFs } from "webappwiz/system/testing";
import { Rules } from "./rules";
import { ruleDoc } from "./testing";

describe("Rules", () => {
	let fs: FakeFs;

	const install = async (id: string, doc = ruleDoc(id)) => {
		await fs.mkdir(`/p/.wiz/scry/${id}`);
		await fs.write(`/p/.wiz/scry/${id}/RULE.md`, doc);
	};

	beforeEach(() => {
		fs = new FakeFs();
	});

	it("loads every rule under .wiz/scry, in id order", async () => {
		await install("zeta");
		await install("alpha");

		const rules = await Rules.load("/p", { fs });

		expect(rules.all.map((rule) => rule.id)).toEqual(["alpha", "zeta"]);
	});

	it("has no rules when the project has no .wiz/scry", async () => {
		expect((await Rules.load("/p", { fs })).all).toEqual([]);
	});

	it("skips dotfiles the directory picked up", async () => {
		await install("alpha");
		await fs.write("/p/.wiz/scry/.DS_Store", "");

		expect((await Rules.load("/p", { fs })).all.map((rule) => rule.id)).toEqual(
			["alpha"],
		);
	});

	it("reports every broken rule at once, by path and line", async () => {
		await install(
			"alpha",
			ruleDoc("alpha").replace("level: error", "level: loud"),
		);
		await fs.mkdir("/p/.wiz/scry/empty");
		await install("gamma", ruleDoc("delta"));

		await expect(Rules.load("/p", { fs })).rejects.toThrow(
			[
				".wiz/scry/alpha/RULE.md:5: level: expected one of error, warning",
				".wiz/scry/empty/RULE.md: missing",
				'.wiz/scry/gamma/RULE.md:2: name: "delta" does not match its directory "gamma"',
			].join("\n"),
		);
	});

	it("finds a rule by id", async () => {
		await install("alpha");

		const rules = await Rules.load("/p", { fs });

		expect(rules.get("alpha")?.id).toEqual("alpha");
		expect(rules.get("beta")).toBeUndefined();
	});

	it("finds each rule's scripts, by path from the project root", async () => {
		await install("alpha", ruleDoc("alpha", { effort: "none" }));
		await fs.mkdir("/p/.wiz/scry/alpha/scripts");
		await fs.write("/p/.wiz/scry/alpha/scripts/check.sh", "exit 0\n");

		const rules = await Rules.load("/p", { fs });

		expect(rules.get("alpha")?.scripts).toEqual([
			".wiz/scry/alpha/scripts/check.sh",
		]);
	});
});
