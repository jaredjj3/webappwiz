import { describe, expect, it } from "bun:test";
import { FakeFs } from "webappwiz/system/testing";
import { Cases } from "./cases";
import { ruleDoc } from "./testing";

describe("Cases", () => {
	const load = async (doc: string, evals: Record<string, string> = {}) => {
		const fs = new FakeFs();
		await fs.mkdir("/r/evals");
		await fs.write("/r/RULE.md", doc);
		for (const [name, text] of Object.entries(evals)) {
			await fs.write(`/r/evals/${name}`, text);
		}
		return Cases.load("/r", { fs });
	};

	it("labels the RULE.md examples, then the evals, by where they came from", async () => {
		const cases = await load(ruleDoc("no-bar"), {
			"cart.bad.ts": "bar\n",
			"tax.good.ts": "tax\n",
		});

		expect(
			cases.all.map(({ name, kind, file }) => [name, kind, file.path]),
		).toEqual([
			["RULE.md good 1", "good", "example.ts"],
			["RULE.md bad 1", "bad", "example.ts"],
			["evals/cart.bad.ts", "bad", "cart.ts"],
			["evals/tax.good.ts", "good", "tax.ts"],
		]);
	});

	it("names each case for the file it would be, so a rule about tests reads its examples as tests", async () => {
		const cases = await load(ruleDoc("no-bar", { files: "**/*.test.ts" }), {
			"cart.test.bad.ts": "bar\n",
		});

		expect(cases.all.map(({ file }) => file.path)).toEqual([
			"example.test.ts",
			"example.test.ts",
			"cart.test.ts",
		]);
	});

	it("leaves out a file in evals that is labeled neither good nor bad", async () => {
		const cases = await load(ruleDoc("no-bar"), { "README.md": "notes\n" });

		expect(cases.all.map(({ name }) => name)).toEqual([
			"RULE.md good 1",
			"RULE.md bad 1",
		]);
	});

	it("splits the cases into good and bad", async () => {
		const cases = await load(ruleDoc("no-bar"));

		expect([
			cases.good.map(({ name }) => name),
			cases.bad.map(({ name }) => name),
		]).toEqual([["RULE.md good 1"], ["RULE.md bad 1"]]);
	});
});
