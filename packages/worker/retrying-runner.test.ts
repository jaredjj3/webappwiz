import { beforeEach, describe, expect, it } from "bun:test";

import {
	FakeRunner,
	RetryingRunner,
	type Runner,
	type RunnerFactory,
} from "./index";

/** A factory whose first `failures` runners reject whatever they are sent. */
class FlakyFactory implements RunnerFactory<string, string> {
	created = 0;

	constructor(private readonly failures: number) {}

	create(): Promise<Runner<string, string>> {
		this.created++;
		const fails = this.created <= this.failures;
		return Promise.resolve({
			send: () =>
				fails
					? Promise.reject(new Error("runner died"))
					: Promise.resolve("done"),
			dispose: () => {},
		});
	}
}

describe("RetryingRunner", () => {
	let factory: FlakyFactory;

	beforeEach(() => {
		factory = new FlakyFactory(0);
	});

	it("builds nothing until there is work to do", () => {
		new RetryingRunner(factory);

		expect(factory.created).toBe(0);
	});

	it("answers from the runner it built", async () => {
		const runner = new RetryingRunner(factory);

		expect(await runner.send("job")).toBe("done");
		expect(factory.created).toBe(1);
	});

	it("replaces a runner that failed and tries again", async () => {
		const flaky = new FlakyFactory(1);
		const runner = new RetryingRunner(flaky);

		expect(await runner.send("job")).toBe("done");
		expect(flaky.created).toBe(2);
	});

	it("gives up once the retries are used", async () => {
		const runner = new RetryingRunner(new FlakyFactory(5), { retries: 2 });

		await expect(runner.send("job")).rejects.toThrow("runner died");
	});

	it("refuses to send once disposed", async () => {
		const runner = new RetryingRunner(factory);
		runner.dispose();

		await expect(runner.send("job")).rejects.toThrow("runner is disposed");
	});

	it("tears down the runner it built when disposed", async () => {
		const inner = new FakeRunner<string, string>("done");
		const runner = new RetryingRunner({ create: () => Promise.resolve(inner) });

		await runner.send("job");
		runner.dispose();

		expect(inner.disposed).toBe(true);
	});
});
