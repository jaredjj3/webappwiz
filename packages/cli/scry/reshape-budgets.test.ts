import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";
import { reshapeBudgets } from "./reshape-budgets";

describe("reshapeBudgets", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	const path = "/p/scry.config.ts";

	const reshape = async (budgets: string) => {
		await fs.write(
			path,
			`export default {\n\texclude: ["vendor/**"],\n\tbudgets: ${budgets},\n} satisfies ScryConfig;\n`,
		);
		await reshapeBudgets(path, { fs, log });
		return fs.read(path);
	};
	const said = () => log.entries.map((entry) => String(entry.message));

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		await fs.mkdir("/p", { recursive: true });
	});

	it("gives each model the limits the list gave it, one or a list", async () => {
		expect(
			await reshape(
				'[\n\t\t{ som: 5_000_000, llm: 2_000_000, per: "month" },\n\t\t{ llm: 300_000, within: "7d" },\n\t]',
			),
		).toEqual(
			[
				"export default {",
				'\texclude: ["vendor/**"],',
				"\tbudgets: {",
				'\t\tsom: { tokens: 5_000_000, per: "month" },',
				"\t\tllm: [",
				'\t\t\t{ tokens: 2_000_000, per: "month" },',
				'\t\t\t{ tokens: 300_000, within: "7d" },',
				"\t\t],",
				"\t},",
				"} satisfies ScryConfig;",
				"",
			].join("\n"),
		);
		expect(said()).toEqual([
			"gave each model its own budget in /p/scry.config.ts",
		]);
	});

	it("says nothing for a model no entry named or one gave nothing, and keeps unlimited", async () => {
		expect(
			await reshape(
				'[{ som: "unlimited", per: "day" }, { som: 100, llm: "nothing", per: "check" }]',
			),
		).toContain(
			'\t\tsom: { tokens: 100, per: "check" },\n\t\tllm: "nothing",\n',
		);
		expect(await reshape('[{ som: "unlimited" }]')).toContain(
			'\t\tsom: "unlimited",\n\t\tllm: "nothing",\n',
		);
	});

	it("says to rewrite by hand a list it cannot read, leaving it be", async () => {
		const budgets = '[{ som: LIMIT, per: "day" }]';

		expect(await reshape(budgets)).toContain(`budgets: ${budgets},`);
		expect(said()).toEqual([
			'/p/scry.config.ts sets scry.budgets as a list: give each model what it may spend by hand, like { som: { tokens: 5_000_000, per: "day" }, llm: "nothing" }',
		]);
	});

	it("leaves budgets in the new shape alone", async () => {
		const budgets = '{ som: "unlimited", llm: "nothing" }';

		expect(await reshape(budgets)).toContain(`budgets: ${budgets},`);
		expect(said()).toEqual([]);
	});
});
