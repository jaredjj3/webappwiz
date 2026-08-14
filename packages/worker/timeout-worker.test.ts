import { beforeEach, describe, expect, it } from "bun:test";
import { Duration } from "@webappwiz/time";
import { FakeTimer } from "@webappwiz/time/testing";

import { FakeWorker, TimeoutWorker } from "./index";

describe("TimeoutWorker", () => {
	let timer: FakeTimer;
	let inner: FakeWorker<string, string>;
	let worker: TimeoutWorker<string, string>;

	beforeEach(() => {
		timer = new FakeTimer();
		inner = new FakeWorker("done");
		worker = new TimeoutWorker(inner, timer, Duration.secs(30));
	});

	it("passes the answer through when it arrives in time", async () => {
		expect(await worker.send("job")).toBe("done");
	});

	it("passes the input through to what it wraps", async () => {
		await worker.send("job");

		expect(inner.sent).toEqual(["job"]);
	});

	it("rejects once the deadline passes", async () => {
		const stuck = new TimeoutWorker(
			{ send: () => new Promise<string>(() => {}), dispose: () => {} },
			timer,
			Duration.secs(30),
		);

		const answer = stuck.send("job");
		timer.fireTimeouts();

		await expect(answer).rejects.toThrow("worker timed out after 30000ms");
	});

	it("tears down what it wraps when disposed", () => {
		worker.dispose();

		expect(inner.disposed).toBe(true);
	});
});
