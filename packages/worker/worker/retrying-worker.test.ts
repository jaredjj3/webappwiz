import { beforeEach, describe, expect, it } from "bun:test";

import {
	FakeWorker,
	RetryingWorker,
	type Worker,
	type WorkerFactory,
} from "../index";

/** A factory whose first `failures` workers reject whatever they are sent. */
class FlakyFactory implements WorkerFactory<string, string> {
	created = 0;

	constructor(private readonly failures: number) {}

	create(): Promise<Worker<string, string>> {
		this.created++;
		const fails = this.created <= this.failures;
		return Promise.resolve({
			send: () =>
				fails
					? Promise.reject(new Error("worker died"))
					: Promise.resolve("done"),
			dispose: () => {},
		});
	}
}

describe("RetryingWorker", () => {
	let factory: FlakyFactory;

	beforeEach(() => {
		factory = new FlakyFactory(0);
	});

	it("builds nothing until there is work to do", () => {
		new RetryingWorker(factory);

		expect(factory.created).toBe(0);
	});

	it("answers from the worker it built", async () => {
		const worker = new RetryingWorker(factory);

		expect(await worker.send("job")).toBe("done");
		expect(factory.created).toBe(1);
	});

	it("replaces a worker that failed and tries again", async () => {
		const flaky = new FlakyFactory(1);
		const worker = new RetryingWorker(flaky);

		expect(await worker.send("job")).toBe("done");
		expect(flaky.created).toBe(2);
	});

	it("gives up once the retries are used", async () => {
		const worker = new RetryingWorker(new FlakyFactory(5), { retries: 2 });

		await expect(worker.send("job")).rejects.toThrow("worker died");
	});

	it("refuses to send once disposed", async () => {
		const worker = new RetryingWorker(factory);
		worker.dispose();

		await expect(worker.send("job")).rejects.toThrow("worker is disposed");
	});

	it("tears down the worker it built when disposed", async () => {
		const inner = new FakeWorker<string, string>("done");
		const worker = new RetryingWorker({ create: () => Promise.resolve(inner) });

		await worker.send("job");
		worker.dispose();

		expect(inner.disposed).toBe(true);
	});
});
