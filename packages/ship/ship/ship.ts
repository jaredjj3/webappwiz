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
	 * Carries it out, throwing if it does not land. Run it again after a
	 * failure: everything that already went out is skipped, so a second run
	 * finishes the release rather than starting a new one.
	 */
	run(release: Release): Promise<void>;
}
