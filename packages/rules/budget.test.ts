import { describe, expect, it } from "bun:test";
import { Budget } from "./budget";

describe("Budget", () => {
	it("batches low complexity wide and gives high a block a rule", () => {
		const budget = Budget.default();

		expect(budget.rules("low")).toEqual(8);
		expect(budget.rules("medium")).toEqual(4);
		expect(budget.rules("high")).toEqual(1);
	});

	it("spends its pairs on files, so a wider block takes fewer", () => {
		const budget = Budget.default();

		expect(budget.files("low", 1)).toEqual(40);
		expect(budget.files("low", 5)).toEqual(8);
		expect(budget.files("low", 8)).toEqual(5);
	});

	it("leaves a block one file however deep the rules go", () => {
		expect(
			Budget.of({
				low: { rules: 8, pairs: 4 },
				medium: { rules: 4, pairs: 16 },
				high: { rules: 1, pairs: 25 },
			}).files("low", 8),
		).toEqual(1);
	});

	it("takes a roster stating every complexity", () => {
		const budget = Budget.of({
			low: { rules: 2, pairs: 10 },
			medium: { rules: 2, pairs: 8 },
			high: { rules: 3, pairs: 6 },
		});

		expect(budget.rules("high")).toEqual(3);
		expect(budget.files("high", 3)).toEqual(2);
	});

	it("re-budgets every complexity's pairs, keeping the rule caps", () => {
		const budget = Budget.default().withPairs(100);

		expect(budget.files("high", 1)).toEqual(100);
		expect(budget.files("low", 5)).toEqual(20);
		expect(budget.rules("low")).toEqual(8);
		expect(budget.rules("high")).toEqual(1);
	});
});
