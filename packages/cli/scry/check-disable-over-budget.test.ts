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
import { color } from "webappwiz/log";
import { check } from "./check";
import { Testing } from "./testing";

describe("wiz scry --disable-over-budget", () => {
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

	const run = () =>
		check({
			paths: ["a.ts"],
			format: "text",
			disableOverBudget: true,
			...sandbox.deps,
			clock: sandbox.clock,
		});

	it("turns off a model the check would go over, checking the rest, and asks it nothing", async () => {
		await sandbox.budget('[{ som: 200, llm: "unlimited", per: "check" }]');

		await run();

		expect(color.strip(sandbox.printed())).toContain(
			"  why-not-what   1 file   over the som budget for this check",
		);
		expect([
			(sandbox.judge as FakeJudge).judgments,
			sandbox.proc.exits,
		]).toEqual([[], []]);
	});

	it("turns off a model budgeted nothing rather than leave its rules unchecked", async () => {
		await sandbox.budget('[{ llm: "unlimited" }]');

		await run();

		expect([color.strip(sandbox.printed()), sandbox.proc.exits]).toEqual([
			expect.stringContaining(
				"  why-not-what   1 file   scry.budgets spends nothing on the som",
			),
			[],
		]);
	});

	it("checks by code alone with no budget declared", async () => {
		await sandbox.fs.rm(`${sandbox.root}/.config/scry/config.ts`);

		await run();

		expect(color.strip(sandbox.printed())).toContain(
			"  why-not-what   1 file   no budget declared",
		);
	});

	it("asks a model the check fits in", async () => {
		await sandbox.budget('[{ som: 500, llm: "unlimited", per: "day" }]');

		await run();

		expect((sandbox.judge as FakeJudge).judgments.length).toEqual(1);
	});
});
