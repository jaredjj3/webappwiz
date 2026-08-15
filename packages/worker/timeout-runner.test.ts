import { beforeEach, describe, expect, it } from "bun:test";
import { Duration } from "@webappwiz/time";
import { FakeTimer } from "@webappwiz/time/testing";

import { FakeRunner, TimeoutRunner } from "./index";

describe("TimeoutRunner", () => {
	let timer: FakeTimer;
	let inner: FakeRunner<string, string>;
	let runner: TimeoutRunner<string, string>;

	beforeEach(() => {
		timer = new FakeTimer();
		inner = new FakeRunner("done");
		runner = new TimeoutRunner(inner, timer, Duration.secs(30));
	});

	it("passes the answer through when it arrives in time", async () => {
		expect(await runner.send("job")).toBe("done");
	});

	it("passes the input through to what it wraps", async () => {
		await runner.send("job");

		expect(inner.sent).toEqual(["job"]);
	});

	it("rejects once the deadline passes", async () => {
		const stuck = new TimeoutRunner(
			{ send: () => new Promise<string>(() => {}), dispose: () => {} },
			timer,
			Duration.secs(30),
		);

		const answer = stuck.send("job");
		timer.fireTimeouts();

		await expect(answer).rejects.toThrow("runner timed out after 30000ms");
	});

	it("tears down what it wraps when disposed", () => {
		runner.dispose();

		expect(inner.disposed).toBe(true);
	});
});
