import { beforeEach, describe, expect, it } from "bun:test";
import { Duration, Throttler } from "webappwiz/time";
import { FakeTimer } from "webappwiz/time/testing";

import { ThrottledTaskQueue } from "./index";

describe("ThrottledTaskQueue", () => {
	let timer: FakeTimer;
	let queue: ThrottledTaskQueue;
	let runs: number;

	beforeEach(() => {
		timer = new FakeTimer();
		runs = 0;
		queue = new ThrottledTaskQueue(
			new Throttler(timer, Duration.ms(100)),
			() => {
				runs++;
			},
		);
	});

	it("runs the task straight away on the first trigger", () => {
		queue.trigger();

		expect(runs).toBe(1);
		expect(queue.state()).toBe("idle");
	});

	it("holds a burst to one run per interval", () => {
		queue.trigger();
		queue.trigger();
		queue.trigger();

		expect(runs).toBe(1);
		expect(queue.state()).toBe("busy");

		timer.fireTimeouts();

		expect(runs).toBe(2);
		expect(queue.state()).toBe("idle");
	});

	it("says nothing more once the burst has ended", () => {
		queue.trigger();
		timer.fireTimeouts();

		expect(runs).toBe(1);
	});

	it("announces the wait for the next run and the end of it", () => {
		const seen: string[] = [];
		queue.events.on("change", () => seen.push(queue.state()));

		queue.trigger();
		queue.trigger();
		timer.fireTimeouts();

		expect(seen).toEqual(["busy", "idle", "busy", "idle"]);
	});

	it("drops what is waiting when cancelled", () => {
		queue.trigger();
		queue.trigger();
		queue.cancel();

		timer.fireTimeouts();

		expect(runs).toBe(1);
		expect(queue.state()).toBe("idle");
	});

	it("stops answering triggers once disposed", () => {
		queue.trigger();
		queue.trigger();
		queue.dispose();

		timer.fireTimeouts();

		expect(runs).toBe(1);
	});
});
