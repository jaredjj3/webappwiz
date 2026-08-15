import { beforeEach, describe, expect, it } from "bun:test";
import { FakeFs } from "@webappwiz/system/testing";
import { calibrate, floor, overheads, predict, priced } from "./cost";

describe("cost", () => {
	let fs: FakeFs;

	beforeEach(() => {
		fs = new FakeFs();
	});

	it("prices a million tokens at the model's listed input rate", () => {
		expect(floor("haiku", 1_000_000)).toBe(1);
		expect(floor("sonnet", 1_000_000)).toBe(3);
		expect(floor("opus", 1_000_000)).toBe(5);
	});

	it("has no price for a command nobody publishes a rate for", () => {
		expect(floor("some-script", 1_000_000)).toBeUndefined();
	});

	it("prices every agent --agent accepts", () => {
		expect(priced()).toEqual(["haiku", "sonnet", "opus"]);
	});

	it("reads back what a run recorded", async () => {
		await calibrate("/p", "haiku", 2.5, { fs: fs });

		expect(await overheads("/p", { fs: fs })).toEqual({ haiku: 2.5 });
	});

	it("keeps each agent's measurement when another is recorded", async () => {
		await calibrate("/p", "haiku", 2.5, { fs: fs });
		await calibrate("/p", "opus", 1.8, { fs: fs });

		expect(await overheads("/p", { fs: fs })).toEqual({
			haiku: 2.5,
			opus: 1.8,
		});
	});

	it("replaces an agent's earlier measurement with the newer one", async () => {
		await calibrate("/p", "haiku", 2.5, { fs: fs });
		await calibrate("/p", "haiku", 1.9, { fs: fs });

		expect(await overheads("/p", { fs: fs })).toEqual({ haiku: 1.9 });
	});

	it("has measured nothing before a run has finished there", async () => {
		expect(await overheads("/p", { fs: fs })).toEqual({});
	});

	it("measures nothing rather than throwing on a file it cannot read", async () => {
		await fs.mkdir("/p/.wiz");
		await fs.write("/p/.wiz/judge-cost.json", "not json {");

		expect(await overheads("/p", { fs: fs })).toEqual({});
	});

	it("charges the measured overhead once per call, not once per run", () => {
		// The floor is $1 either way; five calls pay the overhead five times.
		expect(predict("haiku", 1_000_000, 1, { haiku: 0.065 })).toBeCloseTo(1.065);
		expect(predict("haiku", 1_000_000, 5, { haiku: 0.065 })).toBeCloseTo(1.325);
	});

	it("is the floor alone until a run has measured the agent", () => {
		expect(predict("haiku", 1_000_000, 5, {})).toBe(1);
		expect(predict("haiku", 1_000_000, 5, { opus: 0.3 })).toBe(1);
	});

	it("predicts nothing for a command with no listed price", () => {
		expect(predict("some-script", 1_000_000, 5, {})).toBeUndefined();
	});

	it("drops a recorded overhead that is not a positive number", async () => {
		await fs.mkdir("/p/.wiz");
		await fs.write(
			"/p/.wiz/judge-cost.json",
			'{"haiku": "2.5", "sonnet": 0, "opus": 1.8}',
		);

		expect(await overheads("/p", { fs: fs })).toEqual({ opus: 1.8 });
	});
});
