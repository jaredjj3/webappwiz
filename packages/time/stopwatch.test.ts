import { beforeEach, describe, expect, it } from "bun:test";

import { Duration, Stopwatch } from "./index";
import { FakeClock } from "./testing";

describe("Stopwatch", () => {
	let clock: FakeClock;
	let stopwatch: Stopwatch;

	beforeEach(() => {
		clock = new FakeClock();
		stopwatch = new Stopwatch(clock);
	});

	it("reads zero before it is started", () => {
		expect(stopwatch.elapsed().ms).toBe(0);
		expect(stopwatch.isRunning()).toBe(false);
	});

	it("counts up while it runs", () => {
		stopwatch.start();
		clock.advance(Duration.secs(3));

		expect(stopwatch.elapsed().secs).toBe(3);
		expect(stopwatch.isRunning()).toBe(true);
	});

	it("leaves out the time it spent paused", () => {
		stopwatch.start();
		clock.advance(Duration.secs(3));
		stopwatch.stop();
		clock.advance(Duration.mins(5));
		stopwatch.resume();
		clock.advance(Duration.secs(2));

		expect(stopwatch.elapsed().secs).toBe(5);
	});

	it("holds its reading while paused", () => {
		stopwatch.start();
		clock.advance(Duration.secs(3));
		stopwatch.stop();
		clock.advance(Duration.secs(9));

		expect(stopwatch.elapsed().secs).toBe(3);
	});

	it("goes back to zero when started again", () => {
		stopwatch.start();
		clock.advance(Duration.secs(3));
		stopwatch.start();

		expect(stopwatch.elapsed().ms).toBe(0);
	});

	it("stops when disposed, keeping what it had", () => {
		stopwatch.start();
		clock.advance(Duration.secs(3));
		stopwatch.dispose();
		clock.advance(Duration.secs(9));

		expect(stopwatch.elapsed().secs).toBe(3);
	});
});
