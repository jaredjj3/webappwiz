import type { Resource } from "@webappwiz/disposable";

/**
 * Work sent somewhere else and answered, one request at a time from the
 * caller's point of view. A `Worker<Input, Output>` says what goes in and what
 * comes back; where it actually runs is the implementation's business.
 *
 * ```ts
 * const worker: Worker<Job, Result> = await factory.create();
 * const result = await worker.send(job);
 * worker.dispose();
 * ```
 *
 * Disposing tears the worker down and rejects everything still in flight.
 */
export interface Worker<Input, Output> extends Resource {
	send(input: Input): Promise<Output>;
}
