import type { Worker } from "../worker/worker";

/**
 * Makes a worker on demand, so something that has to replace a dead one does
 * not have to know how it was built.
 */
export interface WorkerFactory<Input, Output> {
	create(): Promise<Worker<Input, Output>>;
}
