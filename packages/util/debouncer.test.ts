import { describe, expect, it } from "bun:test";
import { Duration } from "@webappwiz/time";
import { FakeTimer } from "@webappwiz/time/testing";

import { Debouncer, Throttler } from "./index";

describe("Debouncer", () => {
	it("runs only the last call of a burst", () => {
		const timer = new FakeTimer();
		const debouncer = new Debouncer(timer, Duration.ms(300));
		const ran: string[] = [];

		debouncer.call(() => ran.push("first"));
		debouncer.call(() => ran.push("second"));
		expect(ran).toEqual([]);

		timer.fireTimeouts();
		expect(ran).toEqual(["second"]);
	});

	it("runs what is waiting when flushed, and nothing after cancelling", () => {
		const timer = new FakeTimer();
		const debouncer = new Debouncer(timer, Duration.ms(300));
		const ran: string[] = [];

		debouncer.call(() => ran.push("flushed"));
		debouncer.flush();
		expect(ran).toEqual(["flushed"]);

		debouncer.call(() => ran.push("cancelled"));
		debouncer.cancel();
		timer.fireTimeouts();
		expect(ran).toEqual(["flushed"]);
	});
});

describe("Throttler", () => {
	it("runs the first call at once and holds the rest for the interval", () => {
		const timer = new FakeTimer();
		const throttler = new Throttler(timer, Duration.ms(100));
		const ran: string[] = [];

		throttler.call(() => ran.push("first"));
		expect(ran).toEqual(["first"]);

		throttler.call(() => ran.push("second"));
		throttler.call(() => ran.push("third"));
		expect(ran).toEqual(["first"]);

		timer.fireTimeouts();
		expect(ran).toEqual(["first", "third"]);
	});
});
