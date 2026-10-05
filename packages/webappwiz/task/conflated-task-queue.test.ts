import { beforeEach, describe, expect, it } from "bun:test";

import { ConflatedTaskQueue } from "./index";

describe("ConflatedTaskQueue", () => {
	let runs: number;
	/** Finishes the run under way, which holds until this is called. */
	let release: () => void;
	let queue: ConflatedTaskQueue;

	beforeEach(() => {
		runs = 0;
		release = () => {};
		queue = new ConflatedTaskQueue(() => {
			runs++;
			return new Promise<void>((resolve) => {
				release = resolve;
			});
		});
	});

	it("runs the task once for a single trigger", async () => {
		queue.trigger();
		release();
		await Promise.resolve();

		expect(runs).toBe(1);
		expect(queue.state()).toBe("idle");
	});

	it("collapses every trigger arriving mid-run into one rerun", async () => {
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
		queue.events.on("change", () => seen.push(queue.state()));

		queue.trigger();
		release();
		await Promise.resolve();

		expect(seen).toEqual(["busy", "idle"]);
	});

	it("drops a pending rerun when cancelled", async () => {
		queue.trigger();
		queue.trigger();
		queue.cancel();

		release();
		await Promise.resolve();
		expect(runs).toBe(1);
	});
});
