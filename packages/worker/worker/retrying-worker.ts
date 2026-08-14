import { assert } from "@webappwiz/util";
import type { WorkerFactory } from "../worker-factory/worker-factory";
import type { Worker } from "./worker";

export interface RetryOptions {
	/** How many times to build a fresh worker and try again. Defaults to 1. */
	retries?: number;
}

/**
 * A `Worker` that builds its own from a factory, and on failure throws it away
 * and tries again with a new one. A worker that has died stays dead, so
 * replacing it is the only recovery there is.
 *
 * ```ts
 * const worker = new RetryingWorker(factory, { retries: 2 });
 * ```
 *
 * The worker is built on the first `send`, not up front, so nothing starts
 * until there is work for it.
 */
export class RetryingWorker<Input, Output> implements Worker<Input, Output> {
	private readonly retries: number;
	private worker: Worker<Input, Output> | null = null;
	private creating: Promise<Worker<Input, Output>> | null = null;
	private isDisposed = false;

	constructor(
		private readonly factory: WorkerFactory<Input, Output>,
		opts: RetryOptions = {},
	) {
		this.retries = opts.retries ?? 1;
	}

	async send(input: Input): Promise<Output> {
		for (let attempt = 0; attempt <= this.retries; attempt++) {
			if (this.isDisposed) {
				throw new Error("worker is disposed");
			}
			try {
				this.worker ??= await this.create();
				// Disposal can land while the worker is being built, and using it
				// then would leave something running that nobody will ever tear down.
				if (this.isDisposed) {
					throw new Error("worker is disposed");
				}
				return await this.worker.send(input);
			} catch (error) {
				this.discard();
				if (this.isDisposed || attempt === this.retries) {
					throw error;
				}
			}
		}
		assert.unreachable();
	}

	dispose(): void {
		this.isDisposed = true;
		this.worker?.dispose();
		this.worker = null;
	}

	private create(): Promise<Worker<Input, Output>> {
		// Held so concurrent sends share one build rather than starting a worker
		// each and leaking all but the last.
		this.creating ??= this.factory.create();
		return this.creating;
	}

	private discard(): void {
		this.worker?.dispose();
		this.worker = null;
		this.creating = null;
	}
}
