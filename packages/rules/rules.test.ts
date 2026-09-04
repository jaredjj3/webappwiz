import { beforeEach, describe, expect, it } from "bun:test";
import { FakeFs } from "webappwiz/system/testing";
import type { ChangedFile } from "./changed";
import { Rule } from "./rule";
import { Rules } from "./rules";
import { ruleDoc } from "./testing";

describe("Rules", () => {
	let fs: FakeFs;

	const install = async (id: string, doc = ruleDoc(id)) => {
		await fs.mkdir(`/p/.wiz/rules/${id}`);
		await fs.write(`/p/.wiz/rules/${id}/RULE.md`, doc);
	};

	const file = (path: string, added = false): ChangedFile => ({ path, added });

	beforeEach(() => {
		fs = new FakeFs();
	});

	it("loads every rule under .wiz/rules, in id order", async () => {
		await install("zeta");
		await install("alpha");

		const rules = await Rules.load("/p", { fs });

		expect(rules.all.map((rule) => rule.id)).toEqual(["alpha", "zeta"]);
	});

	it("has no rules when the project has no .wiz/rules", async () => {
		expect((await Rules.load("/p", { fs })).all).toEqual([]);
	});

	it("skips dotfiles the directory picked up", async () => {
		await install("alpha");
		await fs.write("/p/.wiz/rules/.DS_Store", "");

		expect((await Rules.load("/p", { fs })).all.map((rule) => rule.id)).toEqual(
			["alpha"],
		);
	});

	it("reports every broken rule at once, by path and line", async () => {
		await install("alpha", ruleDoc("alpha").replace("## Bad", "## Worse"));
		await fs.mkdir("/p/.wiz/rules/empty");
		await install("gamma", ruleDoc("delta"));

		await expect(Rules.load("/p", { fs })).rejects.toThrow(
			[
				".wiz/rules/alpha/RULE.md:9: no `## Bad` section",
				".wiz/rules/empty/RULE.md: missing",
				'.wiz/rules/gamma/RULE.md:2: name: "delta" does not match its directory "gamma"',
			].join("\n"),
		);
	});

	it("finds a rule by id", async () => {
		await install("alpha");

		const rules = await Rules.load("/p", { fs });

		expect(rules.get("alpha")?.id).toEqual("alpha");
		expect(rules.get("beta")).toBeUndefined();
	});

	it("plans one block per rule that matches a changed file", () => {
		const rules = Rules.of([
			Rule.parse(ruleDoc("tests", { files: "**/*.test.ts" })),
			Rule.parse(ruleDoc("source", { files: "**/*.ts" })),
			Rule.parse(ruleDoc("docs", { files: "**/*.md" })),
		]);

		const blocks = rules.review([file("a.ts"), file("a.test.ts", true)]);

		expect(
			blocks.map((block) => [
				block.rule.id,
				block.files.map((file) => file.path),
			]),
		).toEqual([
			["source", ["a.ts", "a.test.ts"]],
			["tests", ["a.test.ts"]],
		]);
	});

	it("keeps which files are new, for the prompt to say so", () => {
		const rules = Rules.of([Rule.parse(ruleDoc("source"))]);

		const [block] = rules.review([file("a.ts", true)]);

		expect(block?.files).toEqual([{ path: "a.ts", added: true }]);
	});

	it("cuts a rule with more files than the chunk into even blocks", () => {
		const rules = Rules.of([Rule.parse(ruleDoc("source"))]);
		const files = ["a", "b", "c", "d", "e"].map((name) => file(`${name}.ts`));

		const blocks = rules.review(files, { chunk: 4 });

		expect(
			blocks.map((block) => [block.part, block.parts, block.files.length]),
		).toEqual([
			[1, 2, 3],
			[2, 2, 2],
		]);
	});

	it("plans nothing when no rule matches", () => {
		const rules = Rules.of([Rule.parse(ruleDoc("docs", { files: "**/*.md" }))]);

		expect(rules.review([file("a.ts")])).toEqual([]);
	});
});
