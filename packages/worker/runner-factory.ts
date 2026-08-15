import type { Runner } from "./runner";

/**
 * Makes a runner on demand, so something that has to replace a dead one does
 * not have to know how it was built.
 */
export interface RunnerFactory<Input, Output> {
	create(): Promise<Runner<Input, Output>>;
}
