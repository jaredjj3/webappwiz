import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFs } from "webappwiz/system";
import { Budgets } from "./budgets";
import { Ledger } from "./ledger";

describe("Budgets", () => {
	const fs = new NodeFs();
	let dir: string;
	let ledger: Ledger;
	// noon on Wednesday 2026-10-14, local time
	const now = new Date(2026, 9, 14, 12).getTime();
	const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).getTime();

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "budgets-"));
		ledger = await Ledger.open(`${dir}/state/scry-spent.json`, { fs });
		await ledger.record([
			{ at: at(1), role: "llm", model: "claude-sonnet-5-5", input: 1 },
			{ at: at(12, 9), role: "llm", model: "claude-sonnet-5-5", input: 10 },
			{ at: at(13), role: "llm", model: "claude-sonnet-5-5", input: 100 },
			{ at: at(14, 9), role: "llm", model: "claude-sonnet-5-5", input: 1000 },
			{ at: at(14, 9), role: "som", model: "clef", input: 5 },
		]);
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("counts what the som spent when it was called decider", async () => {
		const path = `${dir}/state/scry-spent.json`;
		await fs.write(
			path,
			JSON.stringify([
				{ at: at(14, 9), role: "decider", model: "clef", input: 7 },
			]),
		);

		const old = await Ledger.open(path, { fs });

		expect(old.spent("som", at(14, 0))).toEqual(7);
	});

	it("sums each window from its start in local time: the day, the week from Monday, the month, or a rolling one", () => {
		const budgets = Budgets.from({
			som: "unlimited",
			llm: [
				{ tokens: 5000, per: "day" },
				{ tokens: 5000, per: "week" },
				{ tokens: 5000, per: "month" },
				{ tokens: 5000, within: "2d" },
				{ tokens: 5000, per: "check" },
			],
		});

		expect(
			budgets
				.standing(ledger, ledger, now)
				.map((each) => [each.window, each.spent]),
		).toEqual([
			["today", 1000],
			["this week", 1110],
			["this month", 1111],
			["the last 2d", 1100],
			["this check", 0],
		]);
	});

	it("allows a role what is left of its tightest limit, and why it stops there", () => {
		const budgets = Budgets.from({
			som: "unlimited",
			llm: [
				{ tokens: 2000, per: "month" },
				{ tokens: 1500, per: "day" },
			],
		});

		expect([
			budgets.allowance("llm", ledger, ledger, now),
			budgets.allowance("som", ledger, ledger, now),
		]).toEqual([
			{ input: 500, reason: "over the llm budget for today" },
			undefined,
		]);
	});

	it("allows nothing to a role that spends nothing", () => {
		const budgets = Budgets.from({
			som: "nothing",
			llm: { tokens: 2000, per: "day" },
		});

		expect(budgets.allowance("som", ledger, ledger, now)).toEqual({
			input: 0,
			reason: "scry.budgets spends nothing on the som",
		});
	});

	it("spells the presets out for both roles", () => {
		expect([
			Budgets.from("unlimited").unlimited,
			Budgets.from("nothing").spendsNothing("llm"),
		]).toEqual([true, true]);
	});

	it.each([
		[
			"some",
			'scry.budgets: expected "nothing", "unlimited", or what each model may spend, like { som: { tokens: 5_000_000, per: "day" }, llm: "nothing" }',
		],
		[
			[{ som: 1000, llm: "nothing", per: "day" }],
			"scry.budgets: a list of limits is the old shape: run `wiz scry update` to give each model its own",
		],
		[
			{ som: "unlimited" },
			'scry.budgets: say what the llm may spend, like llm: "nothing"',
		],
		[
			{ decider: "nothing", llm: "nothing" },
			"scry.budgets.decider: decider is now som",
		],
		[
			{ som: "nothing", llm: "nothing", per: "day" },
			"scry.budgets: unknown per: expected som and llm",
		],
		[
			{ som: "nothing", llm: 1000 },
			'scry.budgets.llm: expected "nothing", "unlimited", or a limit like { tokens: 2_000_000, per: "month" }',
		],
		[
			{ som: "nothing", llm: [] },
			"scry.budgets.llm: expected a limit, not an empty list",
		],
		[
			{ som: "nothing", llm: { tokens: -1, per: "day" } },
			"scry.budgets.llm.tokens: expected input tokens, got -1",
		],
		[
			{ som: "nothing", llm: { tokens: 1000 } },
			'scry.budgets.llm: expected one window: per "check", "day", "week" or "month", or within, like "7d"',
		],
		[
			{ som: "nothing", llm: { tokens: 1000, per: "day", within: "7d" } },
			'scry.budgets.llm: expected one window: per "check", "day", "week" or "month", or within, like "7d"',
		],
		[
			{ som: "nothing", llm: { tokens: 1000, per: "year" } },
			'scry.budgets.llm.per: expected one of check, day, week, month, got "year"',
		],
		[
			{ som: "nothing", llm: [{ tokens: 1000, within: "7 days" }] },
			'scry.budgets.llm[0].within: expected hours, days or weeks, like "24h", "7d" or "2w", got "7 days"',
		],
		[
			{ som: "nothing", llm: { tokens: 1000, per: "day", cap: 5 } },
			"scry.budgets.llm: unknown cap: expected tokens, then per or within",
		],
	])("refuses budgets a check cannot hold to: %j", (value, message) => {
		expect(() => Budgets.from(value)).toThrow(message);
	});

	it("keeps what another check recorded meanwhile", async () => {
		const other = await Ledger.open(`${dir}/state/scry-spent.json`, { fs });
		await other.record([
			{ at: now, role: "llm", model: "claude-opus-5-5", input: 7 },
		]);

		await ledger.record([
			{ at: now, role: "llm", model: "claude-opus-5-5", input: 3 },
		]);

		expect(ledger.spent("llm", now)).toEqual(10);
	});
});
