import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { FakeJudge } from "@webappwiz/scry/testing";
import { color, MemoryLogger } from "webappwiz/log";
import { pause } from "./budgets-commands";
import { check } from "./check";
import { Testing } from "./testing";

describe("wiz scry", () => {
	let sandbox: Testing;

	beforeAll(async () => {
		sandbox = await Testing.seed();
	});

	afterAll(async () => {
		await sandbox.dispose();
	});

	beforeEach(async () => {
		await sandbox.begin();
		await sandbox.install("why-not-what", sandbox.asking);
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// add one\nconst a = 1;\n",
		);
		sandbox.judge = new FakeJudge(0.9, { input: 300 });
	});

	afterEach(async () => {
		await sandbox.end();
	});

	it("refuses to check with no budget declared, and exits 3", async () => {
		await sandbox.fs.rm(`${sandbox.root}/.config/scry/config.ts`);

		await sandbox.run();

		expect([sandbox.warned(), sandbox.asked, sandbox.proc.exits]).toEqual([
			[
				'no budget declared: set budgets in scry.config.ts or ~/.config/scry/config.ts to "nothing", "unlimited", or what each model may spend, like { som: { tokens: 5_000_000, per: "day" }, llm: "nothing" }; --cost says what a check would spend',
			],
			[],
			[3],
		]);
	});

	it("checks with no budget declared when told to override it", async () => {
		await sandbox.fs.rm(`${sandbox.root}/.config/scry/config.ts`);

		await check({
			paths: ["a.ts"],
			format: "text",
			overrideBudget: true,
			...sandbox.deps,
			clock: sandbox.clock,
		});

		expect(sandbox.printed()).toContain("restates the code");
	});

	it("asks a role budgeted nothing no question, leaving what it would ask unchecked", async () => {
		await sandbox.budget('"nothing"');

		await sandbox.run();

		expect(sandbox.printed()).toContain(
			"  why-not-what on a.ts   scry.budgets spends nothing on the som",
		);
		expect([
			(sandbox.judge as FakeJudge).judgments,
			sandbox.proc.exits,
		]).toEqual([[], [2]]);
	});

	it("asks a paused role no question, and holds it to no budget, until its pause ends", async () => {
		await sandbox.budget(
			'{ som: { tokens: 200, per: "check" }, llm: "unlimited" }',
		);
		await pause({
			role: "som",
			for: "4h",
			format: "json",
			log: new MemoryLogger(),
			fs: sandbox.fs,
			ps: sandbox.ps,
			clock: sandbox.clock,
		});

		await sandbox.run();

		expect(sandbox.printed()).toContain("the som is paused until");
		expect([
			(sandbox.judge as FakeJudge).judgments,
			sandbox.proc.exits,
		]).toEqual([[], [2]]);
	});

	it("refuses up front a check that would go over a budget, saying which, and asks nothing", async () => {
		await sandbox.budget(
			'{ som: { tokens: 200, per: "check" }, llm: "unlimited" }',
		);

		await sandbox.run();

		expect(sandbox.warned().map((line) => color.strip(line))).toEqual([
			[
				"over budget: this check would spend more than scry.budgets allows",
				"budgets",
				"  som   this check   would use 300 of 200, 0 spent   over by 100",
				"  llm   unlimited    would use 0",
				"raise scry.budgets, check fewer files, or run again with --override-budget",
			].join("\n"),
		]);
		expect([
			(sandbox.judge as FakeJudge).judgments,
			sandbox.proc.exits,
		]).toEqual([[], [3]]);
	});

	it("keeps what each check spent on the device, and holds the next to what is left of the window", async () => {
		await sandbox.budget(
			'{ som: { tokens: 500, per: "day" }, llm: "unlimited" }',
		);

		await sandbox.run();
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// add two\nconst a = 2;\n",
		);
		await sandbox.run();

		expect(await sandbox.ledger()).toEqual([
			{ at: sandbox.clock.now(), role: "som", model: "clef", input: 300 },
		]);
		expect(sandbox.proc.exits).toEqual([1, 3]);
		expect(color.strip(sandbox.warned().join("\n"))).toContain(
			"  som   today       would use 300 of 500, 300 spent   over by 100",
		);
	});

	it("forgets what was spent before a rolling window", async () => {
		await sandbox.budget(
			'{ som: { tokens: 500, within: "7d" }, llm: "unlimited" }',
		);
		await sandbox.run();
		sandbox.clock.set(sandbox.clock.now() + 8 * 24 * 60 * 60 * 1000);
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// add two\nconst a = 2;\n",
		);

		await sandbox.run();

		expect([
			(sandbox.judge as FakeJudge).judgments.length,
			sandbox.proc.exits,
		]).toEqual([2, [1, 1]]);
	});

	it("says with --cost what a check would use of each budget, and leave", async () => {
		await sandbox.budget(
			'{ som: [{ tokens: 2_000_000, per: "month" }, { tokens: 1000, within: "7d" }], llm: "unlimited" }',
		);

		await check({
			paths: ["a.ts"],
			format: "text",
			cost: true,
			...sandbox.deps,
			clock: sandbox.clock,
		});

		expect(sandbox.printed()).toEqual(
			[
				"estimated 300 input tokens to check 1 file: 1 question in 1 request",
				"budgets",
				"  som   this month    would use 300 of 2m, 0 spent   2m left",
				"  som   the last 7d   would use 300 of 1k, 0 spent   700 left",
				"  llm   unlimited     would use 0",
			].join("\n"),
		);
	});
});
