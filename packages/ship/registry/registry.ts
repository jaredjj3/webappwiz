import type { Problem } from "../problem";

/** The package registry, as a release touches it. */
export interface Registry {
	/**
	 * What blocks publishing here, each problem carrying its remedy when one
	 * exists. Empty means ready.
	 */
	problems(): Promise<Problem[]>;
	published(name: string, version: string): Promise<boolean>;
	/** Publishes the package in `dir`. */
	publish(dir: string): Promise<void>;
}
