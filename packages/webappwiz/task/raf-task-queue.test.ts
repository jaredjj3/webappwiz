import { beforeEach, describe, expect, it } from "bun:test";
import type { Clock } from "webappwiz/time";
import { Duration } from "webappwiz/time";
import { FakeClock } from "webappwiz/time/testing";

import { type Raf, RafTaskQueue } from "./browser";

type Entry = {
	callback: (dt: Duration) => void | Promise<void>;
	resolve: () => void;
	settled: boolean;
};

/**
 * A `raf` the test drives, so nothing here waits on a real animation frame or
 * needs a DOM to run in.
 */
class FakeRaf {
	readonly clocks: Clock[] = [];
	cancels = 0;
	private entry: Entry | null = null;

	readonly request: Raf = (clock, callback) => {
		this.clocks.push(clock);
		let resolve!: () => void;
		const promise = new Promise<void>((settle) => {
			resolve = settle;
		});
		const entry: Entry = { callback, resolve, settled: false };
		this.entry = entry;
		return {
			promise,
			// A frame already run cannot be given up, which is what the real one
			// does once its callback has started.
			cancel: () => {
				if (entry.settled) {
					return;
				}
				entry.settled = true;
				this.entry = null;
				this.cancels++;
				resolve();
			},
		};
	};

	/** Whether a frame has been asked for and not yet run or given up. */
	get requested(): boolean {
		return this.entry !== null;
	}

	/** Runs the frame that was asked for, as the browser would. */
	async run(): Promise<void> {
		const entry = this.entry;
		if (entry === null) {
			throw new Error("no frame was asked for");
		}
		this.entry = null;
		entry.settled = true;
		await entry.callback(Duration.ms(16));
		entry.resolve();
	}
}

describe("RafTaskQueue", () => {
	let frames: FakeRaf;
	let clock: FakeClock;
	let runs: number;
	let queue: RafTaskQueue;

	beforeEach(() => {
		frames = new FakeRaf();
		clock = new FakeClock();
		runs = 0;
		queue = new RafTaskQueue(
			clock,
			() => {
				runs++;
			},
			{ raf: frames.request },
		);
	});

	it("waits for a frame rather than running the task there and then", () => {
		queue.trigger();

		expect(frames.requested).toBe(true);
		expect(runs).toBe(0);
		expect(queue.state()).toBe("busy");
	});

	it("runs the task on the frame it asked for", async () => {
		queue.trigger();
		await frames.run();

		expect(runs).toBe(1);
		expect(queue.state()).toBe("idle");
	});

	it("asks for the frame with the clock it was built with", () => {
		queue.trigger();

		expect(frames.clocks).toEqual([clock]);
	});

	it("collapses a burst into one frame, then one more with the latest state", async () => {
		queue.trigger();
		queue.trigger();
		queue.trigger();

		await frames.run();
		expect(runs).toBe(1);

		// The triggers that arrived mid-frame become a single rerun, which is a
		// frame of its own rather than more work on the one just spent.
		expect(frames.requested).toBe(true);
		await frames.run();

		expect(runs).toBe(2);
		expect(frames.requested).toBe(false);
	});

	it("gives up the frame when cancelled", () => {
		queue.trigger();
		queue.cancel();

		expect(frames.cancels).toBe(1);
		expect(frames.requested).toBe(false);
		expect(runs).toBe(0);
	});

	it("gives up the frame when disposed", () => {
		queue.trigger();
		queue.dispose();

		expect(frames.cancels).toBe(1);
		expect(runs).toBe(0);
	});
});
