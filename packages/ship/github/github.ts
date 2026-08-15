import type { Problem } from "../problem";

/** The GitHub releases a release publishes. */
export interface Github {
	/**
	 * What blocks releasing here, each problem carrying its remedy when one
	 * exists. Empty means ready.
	 */
	problems(): Promise<Problem[]>;
	/** Publishes release notes for `tag`, or leaves the existing ones alone. */
	release(tag: string): Promise<void>;
}
