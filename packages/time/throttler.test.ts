import { beforeEach, describe, expect, it } from "bun:test";

import { Duration, Throttler } from "./index";
import { FakeTimer } from "./testing";

describe("Throttler", () => {
	let timer: FakeTimer;
	let throttler: Throttler;
	let ran: string[];

	beforeEach(() => {
		timer = new FakeTimer();
		throttler = new Throttler(timer, Duration.ms(100));
		ran = [];
	});

	it("runs the first call straight away", () => {
		throttler.call(() => ran.push("first"));

		expect(ran).toEqual(["first"]);
	});

	it("holds calls made during the interval, keeping only the last", () => {
		throttler.call(() => ran.push("first"));
		throttler.call(() => ran.push("second"));
		throttler.call(() => ran.push("third"));
		expect(ran).toEqual(["first"]);

		timer.fireTimeouts();
		expect(ran).toEqual(["first", "third"]);
	});

	it("drops what is waiting when cancelled", () => {
		throttler.call(() => ran.push("first"));
		throttler.call(() => ran.push("second"));
		throttler.cancel();

		timer.fireTimeouts();
		expect(ran).toEqual(["first"]);
	});
});
