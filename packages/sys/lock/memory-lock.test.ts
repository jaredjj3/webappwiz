import { beforeEach, describe, expect, it } from "bun:test";
import { Duration, sleep } from "@webappwiz/time";
import { MemoryLock } from "./memory-lock";

describe("MemoryLock", () => {
	let lock: MemoryLock;
	let order: string[];

	beforeEach(() => {
		lock = new MemoryLock();
		order = [];
	});

	it("blocks a second acquire until the first releases", async () => {
		await lock.acquire();
		order.push("first-in");

		const waiting = lock.acquire().then(() => order.push("second-in"));

		await sleep(Duration.ms(10));
		expect(order).toEqual(["first-in"]); // still waiting on the mutex

		order.push("first-out");
		await lock.release();
		await waiting;

		expect(order).toEqual(["first-in", "first-out", "second-in"]);
	});

	it("hands the lock to waiters in the order they arrived", async () => {
		await lock.acquire();

		const first = lock.acquire().then(() => {
			order.push("first");
			return lock.release();
		});
		const second = lock.acquire().then(() => {
			order.push("second");
			return lock.release();
		});
		const third = lock.acquire().then(() => {
			order.push("third");
			return lock.release();
		});

		await lock.release();
		await Promise.all([first, second, third]);

		expect(order).toEqual(["first", "second", "third"]);
	});

	it("stays free when released twice", async () => {
		await lock.acquire();
		await lock.release();
		await lock.release();

		await lock.acquire();
		order.push("acquired again");

		expect(order).toEqual(["acquired again"]);
		await lock.release();
	});

	it("releases without a holder to check when calling releaseIfOurs", async () => {
		await lock.acquire();
		await lock.releaseIfOurs();

		const waiting = lock.acquire().then(() => order.push("second-in"));
		await waiting;

		expect(order).toEqual(["second-in"]);
	});
});
