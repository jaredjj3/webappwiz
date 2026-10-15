import { describe, expect, it } from "bun:test";
import { parseSpend, parseTokens, saySpend } from "./spend";

describe("spend", () => {
	it("reads nothing, unlimited, a limit, or limits joined by commas", () => {
		expect([
			parseSpend("nothing"),
			parseSpend("unlimited"),
			parseSpend("5m/day"),
			parseSpend("2m/month,300k/7d"),
		]).toEqual([
			"nothing",
			"unlimited",
			{ tokens: 5_000_000, per: "day" },
			[
				{ tokens: 2_000_000, per: "month" },
				{ tokens: 300_000, within: "7d" },
			],
		]);
	});

	it("refuses a spend with no window, or one it does not know", () => {
		expect(() => parseSpend("5m")).toThrow("limits like 5m/day");
		expect(() => parseSpend("5m/fortnight")).toThrow("hours, days or weeks");
	});

	it("reads back what it says", () => {
		expect(saySpend(parseSpend("1.5m/week,300k/24h,750/check"))).toEqual(
			"1.5m/week,300k/24h,750/check",
		);
	});

	it("reads tokens as plain counts, underscores, and k or m", () => {
		expect([
			parseTokens("300"),
			parseTokens("5_000_000"),
			parseTokens("300k"),
			parseTokens("1.5M"),
		]).toEqual([300, 5_000_000, 300_000, 1_500_000]);
	});
});
