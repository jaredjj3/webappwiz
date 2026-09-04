import { beforeEach, describe, expect, it } from "bun:test";
import { FakeFs } from "webappwiz/system/testing";
import { Budget } from "./budget";
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
		await install(
			"alpha",
			ruleDoc("alpha").replace("level: error", "level: loud"),
		);
		await fs.mkdir("/p/.wiz/rules/empty");
		await install("gamma", ruleDoc("delta"));

		await expect(Rules.load("/p", { fs })).rejects.toThrow(
			[
				".wiz/rules/alpha/RULE.md:5: level: expected one of error, warning",
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

	const plan = (rules: Rules, files: ChangedFile[], pairs?: number) =>
		rules
			.review(
				files,
				pairs === undefined
					? {}
					: { budget: Budget.default().withPairs(pairs) },
			)
			.map((block) => [
				block.number,
				block.rules.map((rule) => rule.id),
				block.files.map((file) => file.path),
			]);

	it("gathers the rules that match the same files, by complexity", () => {
		const rules = Rules.of([
			Rule.parse(ruleDoc("alpha", { complexity: "low" })),
			Rule.parse(ruleDoc("beta", { complexity: "low" })),
			Rule.parse(ruleDoc("gamma", { complexity: "medium" })),
			Rule.parse(
				ruleDoc("delta", { complexity: "low", files: "**/*.test.ts" }),
			),
		]);

		expect(plan(rules, [file("a.ts"), file("a.test.ts")])).toEqual([
			[1, ["alpha", "beta"], ["a.ts", "a.test.ts"]],
			[2, ["delta"], ["a.test.ts"]],
			[3, ["gamma"], ["a.ts", "a.test.ts"]],
		]);
	});

	it("gathers on the files matched, not the glob that matched them", () => {
		const rules = Rules.of([
			Rule.parse(ruleDoc("alpha", { complexity: "low", files: "**/*.ts" })),
			Rule.parse(ruleDoc("beta", { complexity: "low", files: "**/*.{ts,md}" })),
		]);

		expect(plan(rules, [file("a.ts")])).toEqual([
			[1, ["alpha", "beta"], ["a.ts"]],
		]);
		expect(plan(rules, [file("a.ts"), file("a.md")])).toEqual([
			[1, ["alpha"], ["a.ts"]],
			[2, ["beta"], ["a.ts", "a.md"]],
		]);
	});

	it("gives a high-complexity rule a block to itself", () => {
		const rules = Rules.of(
			["alpha", "beta"].map((id) =>
				Rule.parse(ruleDoc(id, { complexity: "high" })),
			),
		);

		expect(plan(rules, [file("a.ts")])).toEqual([
			[1, ["alpha"], ["a.ts"]],
			[2, ["beta"], ["a.ts"]],
		]);
	});

	it("splits a gathering wider than its rule cap", () => {
		const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
		const rules = Rules.of(
			ids.map((id) => Rule.parse(ruleDoc(id, { complexity: "low" }))),
		);

		const blocks = rules.review([file("a.ts")]);

		expect(blocks.map((block) => block.rules.map((rule) => rule.id))).toEqual([
			["a", "b", "c", "d", "e"],
			["f", "g", "h", "i"],
		]);
	});

	it("splits a gathering deeper than its pair budget", () => {
		const rules = Rules.of(
			["a", "b", "c", "d"].map((id) =>
				Rule.parse(ruleDoc(id, { complexity: "medium" })),
			),
		);
		const files = ["v", "w", "x", "y", "z"].map((name) => file(`${name}.ts`));

		const blocks = rules.review(files);

		expect(blocks.map((block) => block.files.length)).toEqual([3, 2]);
		expect(blocks[0]?.rules.length).toEqual(4);
	});

	it("keeps which files are new, for the prompt to say so", () => {
		const rules = Rules.of([Rule.parse(ruleDoc("source"))]);

		const [block] = rules.review([file("a.ts", true)]);

		expect(block?.files).toEqual([{ path: "a.ts", added: true }]);
	});

	it("cuts a block with more files than its budget into even blocks", () => {
		const rules = Rules.of([Rule.parse(ruleDoc("source"))]);
		const files = ["a", "b", "c", "d", "e"].map((name) => file(`${name}.ts`));

		expect(plan(rules, files, 4)).toEqual([
			[1, ["source"], ["a.ts", "b.ts", "c.ts"]],
			[2, ["source"], ["d.ts", "e.ts"]],
		]);
	});

	it("plans nothing when no rule matches", () => {
		const rules = Rules.of([Rule.parse(ruleDoc("docs", { files: "**/*.md" }))]);

		expect(rules.review([file("a.ts")])).toEqual([]);
	});
});
