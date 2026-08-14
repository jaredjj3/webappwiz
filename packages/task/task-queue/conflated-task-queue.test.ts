import { describe, expect, it } from "bun:test";

import { ConflatedTaskQueue } from "../index";

describe("ConflatedTaskQueue", () => {
	it("runs the task once for a single trigger", async () => {
		let runs = 0;
		const queue = new ConflatedTaskQueue(() => {
			runs++;
		});

		queue.trigger();
		await Promise.resolve();

		expect(runs).toBe(1);
		expect(queue.state()).toBe("idle");
	});

	it("collapses every trigger arriving mid-run into one rerun", async () => {
		let runs = 0;
		let release = () => {};
		const queue = new ConflatedTaskQueue(() => {
			runs++;
			return new Promise<void>((resolve) => {
				release = resolve;
			});
		});

		queue.trigger();
		expect(runs).toBe(1);
		expect(queue.state()).toBe("busy");

		queue.trigger();
		queue.trigger();
		queue.trigger();
		expect(runs).toBe(1);

		release();
		await Promise.resolve();
		expect(runs).toBe(2);
	});

	it("announces going busy and idle again", async () => {
		const seen: string[] = [];
		const queue = new ConflatedTaskQueue(() => {});
		queue.events.on("change", () => seen.push(queue.state()));

		queue.trigger();
		await Promise.resolve();

		expect(seen).toEqual(["busy", "idle"]);
	});

	it("drops a pending rerun when cancelled", async () => {
		let runs = 0;
		let release = () => {};
		const queue = new ConflatedTaskQueue(() => {
			runs++;
			return new Promise<void>((resolve) => {
				release = resolve;
			});
		});

		queue.trigger();
		queue.trigger();
		queue.cancel();

		release();
		await Promise.resolve();
		expect(runs).toBe(1);
	});
});
