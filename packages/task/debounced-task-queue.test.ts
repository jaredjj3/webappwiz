import { beforeEach, describe, expect, it } from "bun:test";
import { Debouncer, Duration } from "@webappwiz/time";
import { FakeTimer } from "@webappwiz/time/testing";

import { DebouncedTaskQueue } from "./index";

describe("DebouncedTaskQueue", () => {
	let timer: FakeTimer;
	let debouncer: Debouncer;
	let runs: number;

	beforeEach(() => {
		timer = new FakeTimer();
		debouncer = new Debouncer(timer, Duration.ms(300));
		runs = 0;
	});

	const queueOf = (task: () => void | Promise<void>) =>
		new DebouncedTaskQueue(debouncer, task);

	it("runs the task once at the end of a burst", async () => {
		const queue = queueOf(() => {
			runs++;
		});

		queue.trigger();
		queue.trigger();
		queue.trigger();
		expect(runs).toBe(0);

		timer.fireTimeouts();
		await Promise.resolve();

		expect(runs).toBe(1);
	});

	it("reads as busy from the first trigger, before the task has started", () => {
		const queue = queueOf(() => {
			runs++;
		});

		queue.trigger();

		expect(queue.state()).toBe("busy");
		expect(runs).toBe(0);
	});

	it("goes idle again once the task has run", async () => {
		const seen: string[] = [];
		const queue = queueOf(() => {
			runs++;
		});
		queue.events.on("change", () => seen.push(queue.state()));

		queue.trigger();
		timer.fireTimeouts();
		await Promise.resolve();

		expect(seen).toEqual(["busy", "idle"]);
	});

	it("runs again for a trigger that arrives while the task is running", async () => {
		let release = () => {};
		const queue = queueOf(() => {
			runs++;
			return new Promise<void>((resolve) => {
				release = resolve;
			});
		});

		queue.trigger();
		timer.fireTimeouts();
		expect(runs).toBe(1);

		queue.trigger();
		release();
		await Promise.resolve();

		expect(runs).toBe(2);
	});

	it("drops what is waiting when cancelled", () => {
		const queue = queueOf(() => {
			runs++;
		});

		queue.trigger();
		queue.cancel();
		timer.fireTimeouts();

		expect(runs).toBe(0);
		expect(queue.state()).toBe("idle");
	});

	it("stops answering triggers once disposed", () => {
		const queue = queueOf(() => {
			runs++;
		});

		queue.trigger();
		queue.dispose();
		timer.fireTimeouts();

		expect(runs).toBe(0);
	});
});
