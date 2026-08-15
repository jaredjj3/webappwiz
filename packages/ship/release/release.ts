import type { Cut } from "../cut";

/**
 * One thing a release does: publish a package, tag the repository, write the
 * notes. Compose them with `releases`, and `ship` the result.
 *
 * ```ts
 * await ship.patch(releases.lockstep(releases.npm("@scope/foo"), releases.git()));
 * ```
 */
export interface Release {
	/**
	 * The workspace packages this publishes, empty for a part that publishes
	 * none. It is what a release cross-checks against the manifest, so a
	 * declaration that drifted is caught before anything moves.
	 */
	readonly packages: readonly string[];
	/**
	 * Carries this part out, throwing if it does not land. Run it again after a
	 * failure: everything that already went out is skipped, so a second run
	 * finishes the release rather than starting a new one.
	 */
	publish(cut: Cut): Promise<void>;
}
