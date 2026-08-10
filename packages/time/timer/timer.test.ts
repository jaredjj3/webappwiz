import { beforeEach, describe, expect, it } from "bun:test";

import { Duration, SystemClock, SystemTimer, sleep } from "../index";
import { FakeClock, FakeTimer } from "../testing";

describe("SystemTimer", () => {
	let timer: SystemTimer;

	beforeEach(() => {
		timer = new SystemTimer();
	});

	it("cancels a pending timeout when disposed", async () => {
		let fired = false;

		const pending = timer.setTimeout(() => {
			fired = true;
		}, Duration.ms(1));
		pending.dispose();
		await sleep(Duration.ms(10));

		expect(fired).toBe(false);
	});

	it("repeats an interval until disposed", async () => {
		let ticks = 0;

		const interval = timer.setInterval(() => {
			ticks += 1;
		}, Duration.ms(1));
		await sleep(Duration.ms(20));
		interval.dispose();
		const settled = ticks;
		await sleep(Duration.ms(10));

		expect(settled).toBeGreaterThan(1);
		expect(ticks).toBe(settled);
	});
});

describe("sleep", () => {
	it("waits at least the given duration", async () => {
		const clock = new SystemClock();

		const start = clock.now();
		await sleep(Duration.ms(20));

		expect(clock.now().subtract(start).ms).toBeGreaterThanOrEqual(15);
	});
});

describe("FakeTimer", () => {
	let timer: FakeTimer;

	beforeEach(() => {
		timer = new FakeTimer();
	});

	it("fires only what the test drives", () => {
		const fired: string[] = [];

		timer.setTimeout(() => fired.push("first"), Duration.secs(1));
		timer.setTimeout(() => fired.push("second"), Duration.secs(2));
		timer.setInterval(() => fired.push("tick"), Duration.secs(1));
		expect(fired).toEqual([]);

		timer.fireTimeout(0);
		timer.fireIntervals();
		timer.fireIntervals();
		expect(fired).toEqual(["first", "tick", "tick"]);

		timer.fireTimeouts();
		timer.fireTimeouts();
		expect(fired).toEqual(["first", "tick", "tick", "second"]);
	});

	it("skips disposed callbacks", () => {
		let fired = 0;

		const pending = timer.setTimeout(() => {
			fired += 1;
		}, Duration.secs(1));
		const interval = timer.setInterval(() => {
			fired += 1;
		}, Duration.secs(1));
		pending.dispose();
		interval.dispose();

		timer.fireTimeouts();
		timer.fireIntervals();

		expect(fired).toBe(0);
	});
});

describe("FakeClock", () => {
	it("moves only when advanced", () => {
		const clock = new FakeClock(Duration.secs(10));

		expect(clock.now().secs).toBe(10);
		clock.advance(Duration.secs(5));
		expect(clock.now().secs).toBe(15);
		clock.set(Duration.zero());
		expect(clock.now().isEqual(Duration.zero())).toBe(true);
	});
});
