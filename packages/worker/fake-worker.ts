import type { Worker } from "./worker";

/**
 * A `Worker` that answers with whatever it was built with, without leaving the
 * thread. It records what it was sent, so a test can say what went out.
 */
export class FakeWorker<Input, Output> implements Worker<Input, Output> {
	readonly sent: Input[] = [];
	disposed = false;

	constructor(private readonly output: Output) {}

	send(input: Input): Promise<Output> {
		this.sent.push(input);
		if (this.disposed) {
			return Promise.reject(new Error("worker is disposed"));
		}
		return Promise.resolve(this.output);
	}

	dispose(): void {
		this.disposed = true;
	}
}
