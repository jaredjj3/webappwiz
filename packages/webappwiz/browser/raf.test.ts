import "../../../setup";
import { beforeEach, describe, expect, it } from "bun:test";
import { Duration } from "webappwiz/time";
import { FakeClock } from "webappwiz/time/testing";

import { raf } from "./index";

describe("raf", () => {
	let clock: FakeClock;

	beforeEach(() => {
		clock = new FakeClock();
	});

	it("runs the callback on the next frame", async () => {
		let ran = false;

		const frame = raf(clock, () => {
			ran = true;
		});
		await frame.promise;

		expect(ran).toBe(true);
	});

	it("hands the callback how long it waited", async () => {
		let waited = Duration.zero();

		const frame = raf(clock, (dt) => {
			waited = dt;
		});
		clock.advance(Duration.ms(16));
		await frame.promise;

		expect(waited.ms).toBe(16);
	});

	it("waits for a callback that returns a promise", async () => {
		let finished = false;

		const frame = raf(clock, async () => {
			await Promise.resolve();
			finished = true;
		});
		await frame.promise;

		expect(finished).toBe(true);
	});

	it("does not run a cancelled frame, and settles anyway", async () => {
		let ran = false;

		const frame = raf(clock, () => {
			ran = true;
		});
		frame.cancel();
		await frame.promise;

		expect(ran).toBe(false);
	});
});
