import { beforeEach, describe, expect, it } from "bun:test";
import { Duration } from "@webappwiz/time";
import { FakeClock } from "@webappwiz/time/testing";

import { MemoryStore } from "./index";

describe("MemoryStore", () => {
	let clock: FakeClock;
	let store: MemoryStore<string, number>;

	beforeEach(() => {
		clock = new FakeClock();
		store = new MemoryStore(clock);
	});

	it("gives back what was put in", async () => {
		await store.set("hits", 1);

		expect(await store.get("hits")).toBe(1);
	});

	it("is null for a key nobody has written", async () => {
		expect(await store.get("missing")).toBeNull();
	});

	it("is null once an entry's time to live has passed", async () => {
		await store.set("hits", 1, { ttl: Duration.secs(30) });

		clock.advance(Duration.secs(29));
		expect(await store.get("hits")).toBe(1);

		clock.advance(Duration.secs(1));
		expect(await store.get("hits")).toBeNull();
	});

	it("keeps an entry written without a time to live", async () => {
		await store.set("hits", 1);

		clock.advance(Duration.days(30));
		expect(await store.get("hits")).toBe(1);
	});

	it("is null after a delete", async () => {
		await store.set("hits", 1);
		await store.delete("hits");

		expect(await store.get("hits")).toBeNull();
	});

	it("sweeps expired entries out rather than growing forever", async () => {
		for (let i = 0; i < 500; i++) {
			await store.set(`key-${i}`, i, { ttl: Duration.secs(1) });
		}
		clock.advance(Duration.secs(2));

		// Nothing is read back here, so only the periodic sweep can notice they
		// have expired, and it takes another 500 writes to come round.
		for (let i = 0; i < 500; i++) {
			await store.set("fresh", i);
		}

		expect(store.size).toBe(1);
	});
});
