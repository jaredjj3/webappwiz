import type { Problem } from "../problem";
import type { Release } from "../release/release";

/**
 * One thing a release does: publish a package, write the notes for the tag,
 * or a whole composition of those. Declare one with `ships` and hand it to a
 * `Runner`.
 */
export interface Ship {
	/**
	 * The workspace packages this publishes, empty for a step that publishes
	 * none. It is what a release cross-checks against the manifest, so a
	 * declaration that drifted is caught before anything moves.
	 */
	readonly packages: readonly string[];
	/**
	 * What blocks it, each problem carrying its remedy when one exists. Empty
	 * means ready.
	 */
	problems(): Promise<Problem[]>;
	/**
	 * Carries it out. Run it again after a failure: everything that already
	 * landed is skipped, so a second run finishes the release rather than
	 * starting a new one.
	 */
	run(release: Release): Promise<void>;
}
