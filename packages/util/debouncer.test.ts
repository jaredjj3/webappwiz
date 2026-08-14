import { beforeEach, describe, expect, it } from "bun:test";
import { Duration } from "@webappwiz/time";
import { FakeTimer } from "@webappwiz/time/testing";

import { Debouncer } from "./index";

describe("Debouncer", () => {
	let timer: FakeTimer;
	let debouncer: Debouncer;
	let ran: string[];

	beforeEach(() => {
		timer = new FakeTimer();
		debouncer = new Debouncer(timer, Duration.ms(300));
		ran = [];
	});

	it("runs only the last call of a burst", () => {
		debouncer.call(() => ran.push("first"));
		debouncer.call(() => ran.push("second"));
		expect(ran).toEqual([]);

		timer.fireTimeouts();
		expect(ran).toEqual(["second"]);
	});

	it("runs what is waiting when flushed", () => {
		debouncer.call(() => ran.push("flushed"));
		debouncer.flush();

		expect(ran).toEqual(["flushed"]);
	});

	it("drops what is waiting when cancelled", () => {
		debouncer.call(() => ran.push("cancelled"));
		debouncer.cancel();

		timer.fireTimeouts();
		expect(ran).toEqual([]);
	});
});
