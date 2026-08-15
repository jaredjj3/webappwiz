import { assert } from "@webappwiz/assert";
import type { Runner } from "./runner";
import type { RunnerFactory } from "./runner-factory";

export interface RetryOptions {
	/** How many times to build a fresh runner and try again. Defaults to 1. */
	retries?: number;
}

/**
 * A `Runner` that builds its own from a factory, and on failure throws it away
 * and tries again with a new one. A runner that has died stays dead, so
 * replacing it is the only recovery there is.
 *
 * ```ts
 * const runner = new RetryingRunner(factory, { retries: 2 });
 * ```
 *
 * The runner is built on the first `send`, not up front, so nothing starts
 * until there is work for it.
 */
export class RetryingRunner<Input, Output> implements Runner<Input, Output> {
	private readonly retries: number;
	private runner: Runner<Input, Output> | null = null;
	private creating: Promise<Runner<Input, Output>> | null = null;
	private isDisposed = false;

	constructor(
		private readonly factory: RunnerFactory<Input, Output>,
		opts: RetryOptions = {},
	) {
		this.retries = opts.retries ?? 1;
	}

	async send(input: Input): Promise<Output> {
		for (let attempt = 0; attempt <= this.retries; attempt++) {
			if (this.isDisposed) {
				throw new Error("runner is disposed");
			}
			try {
				this.runner ??= await this.create();
				// Disposal can land while the runner is being built, and using it
				// then would leave something running that nobody will ever tear down.
				if (this.isDisposed) {
					throw new Error("runner is disposed");
				}
				return await this.runner.send(input);
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
		this.runner?.dispose();
		this.runner = null;
	}

	private create(): Promise<Runner<Input, Output>> {
		// Held so concurrent sends share one build rather than starting a runner
		// each and leaking all but the last.
		this.creating ??= this.factory.create();
		return this.creating;
	}

	private discard(): void {
		this.runner?.dispose();
		this.runner = null;
		this.creating = null;
	}
}
