import { beforeEach, describe, expect, it } from "bun:test";

import { FakePs } from "../testing";

describe("FakePs", () => {
	let ps: FakePs;

	beforeEach(() => {
		ps = new FakePs();
	});

	it("runs the exit handlers when it exits, and records the code", () => {
		const seen: number[] = [];
		ps.once("exit", () => seen.push(ps.getExitCode()));

		ps.exit(1);

		expect(seen).toEqual([1]);
		expect(ps.isExited()).toBe(true);
		expect(ps.getExitCode()).toBe(1);
	});

	it("emits exit once, however many times it is exited", () => {
		let runs = 0;
		ps.on("exit", () => {
			runs += 1;
		});

		ps.exit(1);
		ps.exit(3);

		expect(runs).toBe(1);
		expect(ps.getExitCode()).toBe(1);
	});
});
