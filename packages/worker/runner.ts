import type { Resource } from "@webappwiz/disposable";

/**
 * Work sent somewhere else and answered, one request at a time from the
 * caller's point of view. A `Runner<Input, Output>` says what goes in and what
 * comes back; where it actually runs is the implementation's business.
 *
 * ```ts
 * const runner: Runner<Job, Result> = await factory.create();
 * const result = await runner.send(job);
 * runner.dispose();
 * ```
 *
 * Disposing tears the worker down and rejects everything still in flight.
 */
export interface Runner<Input, Output> extends Resource {
	send(input: Input): Promise<Output>;
}
