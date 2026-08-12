import { beforeEach, describe, expect, it } from "bun:test";
import { NPM_AUTH, plan, ShipHarness } from "./ship-harness";

describe("ship", () => {
	let harness: ShipHarness;

	beforeEach(() => {
		harness = new ShipHarness();
	});

	it("refuses a bump nobody has heard of", async () => {
		harness.planning(plan([]));

		await expect(harness.run("sideways")).rejects.toThrow(
			'unknown version bump "sideways"',
		);
		expect(harness.release.plans).toBe(0);
	});

	it("runs the command a problem carries, then plans again", async () => {
		harness.planning(plan([NPM_AUTH]), plan([NPM_AUTH]));

		await expect(harness.run("patch")).rejects.toThrow("not ready to release");
		expect(harness.ps.getCalls()).toEqual(["npm login"]);
		expect(harness.release.plans).toBe(2);
		expect(harness.release.runs).toEqual([]);
	});

	it("runs nothing for a problem that carries no command", async () => {
		const dirty = { kind: "dirty" as const, message: "uncommitted changes" };
		harness.planning(plan([dirty]));

		await expect(harness.run("patch")).rejects.toThrow("not ready to release");
		expect(harness.ps.getCalls()).toEqual([]);
		expect(harness.release.plans).toBe(1);
	});
});
