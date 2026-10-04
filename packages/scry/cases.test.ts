import { describe, expect, it } from "bun:test";
import { FakeFs } from "webappwiz/system/testing";
import { Cases } from "./cases";

describe("Cases", () => {
	const load = async (evals: Record<string, string> = {}) => {
		const fs = new FakeFs();
		await fs.mkdir("/r/evals");
		await fs.write("/r/RULE.md", "# No bar\n\n```ts\nbar\n```\n");
		for (const [name, text] of Object.entries(evals)) {
			await fs.write(`/r/evals/${name}`, text);
		}
		return Cases.load("/r", { fs });
	};

	it("labels each case in evals by its name, and names its file for the file it would be", async () => {
		const cases = await load({
			"tax.good.ts": "tax\n",
			"cart.test.bad.ts": "bar\n",
		});

		expect(
			cases.all.map(({ name, kind, file }) => [name, kind, file.path]),
		).toEqual([
			["evals/cart.test.bad.ts", "bad", "cart.test.ts"],
			["evals/tax.good.ts", "good", "tax.ts"],
		]);
	});

	it("reads nothing from RULE.md, and leaves out a file labeled neither good nor bad", async () => {
		const cases = await load({ "README.md": "notes\n" });

		expect(cases.all).toEqual([]);
	});

	it("has none when the rule has no evals", async () => {
		const fs = new FakeFs();
		await fs.mkdir("/r");

		expect((await Cases.load("/r", { fs })).all).toEqual([]);
	});

	it("splits the cases into good and bad", async () => {
		const cases = await load({ "a.good.ts": "a\n", "b.bad.ts": "b\n" });

		expect([
			cases.good.map(({ name }) => name),
			cases.bad.map(({ name }) => name),
		]).toEqual([["evals/a.good.ts"], ["evals/b.bad.ts"]]);
	});
});
