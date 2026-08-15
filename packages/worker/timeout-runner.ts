import type { Duration, Timer } from "@webappwiz/time";
import type { Runner } from "./runner";

/**
 * A `Runner` wrapping another, rejecting anything that takes longer than
 * `timeout`. The work carries on wherever it is running: this decides how long
 * the caller waits for it.
 *
 * ```ts
 * const runner = new TimeoutRunner(inner, timer, Duration.secs(30));
 * ```
 */
export class TimeoutRunner<Input, Output> implements Runner<Input, Output> {
	constructor(
		private readonly runner: Runner<Input, Output>,
		private readonly timer: Timer,
		private readonly timeout: Duration,
	) {}

	send(input: Input): Promise<Output> {
		return new Promise<Output>((resolve, reject) => {
			const deadline = this.timer.setTimeout(() => {
				reject(new Error(`runner timed out after ${this.timeout.ms}ms`));
			}, this.timeout);

			this.runner.send(input).then(
				(output) => {
					deadline.dispose();
					resolve(output);
				},
				(error: unknown) => {
					deadline.dispose();
					reject(error);
				},
			);
		});
	}

	dispose(): void {
		this.runner.dispose();
	}
}
