import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFs } from "webappwiz/system";
import { Budgets, Ledger } from "./budgets";

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
		const budgets = Budgets.from([
			{ llm: 5000, per: "day" },
			{ llm: 5000, per: "week" },
			{ llm: 5000, per: "month" },
			{ llm: 5000, within: "2d" },
			{ llm: 5000, per: "check" },
		]);

		expect(
			budgets.standing(ledger, now).map((each) => [each.window, each.spent]),
		).toEqual([
			["today", 1000],
			["this week", 1110],
			["this month", 1111],
			["the last 2d", 1100],
			["this check", 0],
		]);
	});

	it("allows a role what is left of its tightest limit, and why it stops there", () => {
		const budgets = Budgets.from([
			{ som: "unlimited", llm: 2000, per: "month" },
			{ llm: 1500, per: "day" },
		]);

		expect([
			budgets.allowance("llm", ledger, now),
			budgets.allowance("som", ledger, now),
		]).toEqual([
			{ input: 500, reason: "over the llm budget for today" },
			undefined,
		]);
	});

	it("allows nothing to a role an entry calls nothing, or that no entry names", () => {
		const budgets = Budgets.from([{ llm: 2000, som: "nothing", per: "day" }]);
		const only = Budgets.from([{ som: "unlimited" }]);

		expect([
			budgets.allowance("som", ledger, now),
			only.allowance("llm", ledger, now),
		]).toEqual([
			{ input: 0, reason: "scry.budgets spends nothing on the som" },
			{ input: 0, reason: "scry.budgets spends nothing on the llm" },
		]);
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
