import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { Duration } from "webappwiz/time";
import { end, raise, reset, set, show } from "./budgets-commands";
import type { BudgetReport } from "./project-budgets";
import { Testing } from "./testing";

describe("wiz scry budgets", () => {
	let sandbox: Testing;

	beforeAll(async () => {
		sandbox = await Testing.seed();
	});

	afterAll(async () => {
		await sandbox.dispose();
	});

	beforeEach(async () => {
		await sandbox.begin();
		await sandbox.budget(
			`{ som: { tokens: 5_000_000, per: "day" }, llm: "nothing" }`,
		);
	});

	afterEach(async () => {
		await sandbox.end();
	});

	const opts = () => ({
		format: "json" as const,
		log: sandbox.log,
		fs: sandbox.fs,
		ps: sandbox.ps,
		clock: sandbox.clock,
	});

	/** The last report printed. */
	const report = () =>
		JSON.parse(
			String(
				sandbox.log.entries.filter((entry) => entry.level === "info").at(-1)
					?.message,
			),
		) as BudgetReport;

	/** Each role's spend, where it came from, and its windows' tokens. */
	const roles = () =>
		report().roles.map((role) => ({
			role: role.role,
			spend: role.spend,
			set: role.set,
			tokens: role.standing.map((each) => [
				each.window,
				each.tokens,
				each.raised,
			]),
		}));

	it("shows what each model may spend, as the configs declare it", async () => {
		await show(opts());

		expect(roles()).toEqual([
			{
				role: "som",
				spend: "5m/day",
				set: false,
				tokens: [["today", 5_000_000, 0]],
			},
			{ role: "llm", spend: "nothing", set: false, tokens: [] },
		]);
	});

	it("sets a model's budget over the configs, and resets it back", async () => {
		await set({ ...opts(), role: "llm", spend: "2m/month,300k/7d" });
		const after = roles()[1];
		await reset({ ...opts(), role: "llm" });

		expect([after, roles()[1]]).toEqual([
			{
				role: "llm",
				spend: "2m/month,300k/7d",
				set: true,
				tokens: [
					["this month", 2_000_000, 0],
					["the last 7d", 300_000, 0],
				],
			},
			{ role: "llm", spend: "nothing", set: false, tokens: [] },
		]);
	});

	it("sets the other model to nothing when no config declares budgets", async () => {
		await sandbox.fs.rm(`${sandbox.root}/.config/scry/config.ts`);

		await set({ ...opts(), role: "som", spend: "1m/week" });

		expect(roles().map((role) => [role.role, role.spend])).toEqual([
			["som", "1m/week"],
			["llm", "nothing"],
		]);
	});

	it("raises each of a model's limits until the raise ends", async () => {
		await raise({ ...opts(), role: "som", tokens: "2m", for: "4h" });
		const raised = roles()[0]?.tokens;
		sandbox.clock.advance(Duration.hrs(4));
		await show(opts());

		expect([raised, roles()[0]?.tokens]).toEqual([
			[["today", 7_000_000, 2_000_000]],
			[["today", 5_000_000, 0]],
		]);
	});

	it("lets a model that spends nothing spend its raise", async () => {
		await raise({ ...opts(), role: "llm", tokens: "500k", for: "1d" });

		expect(roles()[1]?.tokens).toEqual([["the raise", 500_000, 500_000]]);
	});

	it("ends a raise early by its number", async () => {
		await raise({ ...opts(), role: "som", tokens: "2m", for: "1d" });
		const [made] = report().roles[0]?.raises ?? [];
		await end({ ...opts(), id: made?.id ?? 0 });

		expect([made?.id, report().roles[0]?.raises]).toEqual([1, []]);
	});

	it("refuses to raise an unlimited model", async () => {
		await set({ ...opts(), role: "llm", spend: "unlimited" });

		expect(
			raise({ ...opts(), role: "llm", tokens: "1m", for: "1d" }),
		).rejects.toThrow("the llm is unlimited: there is nothing to raise");
	});
});
