import type { Cut } from "../cut";

/**
 * When a part goes out. Packages `publish` first, the `tag` naming them
 * follows, and the `notes` about the tag come last: a tag for a version no
 * registry took would outlive the failure that caused it, so the order lives
 * here rather than in anyone's declaration.
 */
export type Stage = "publish" | "tag" | "notes";

/** Every stage, in the order a release runs them. */
export const STAGES: readonly Stage[] = ["publish", "tag", "notes"];

/**
 * One thing a release does: publish a package, tag the repository, write the
 * notes. Implement it to teach a release something new, and hand it to
 * `releases.lockstep` beside the parts that come with this package.
 */
export interface Part {
	/**
	 * The workspace packages this publishes, empty for a part that publishes
	 * none. It is what a release cross-checks against the manifest, so a
	 * declaration that drifted is caught before anything moves.
	 */
	readonly packages: readonly string[];
	/** When this runs relative to the other parts; `publish` when omitted. */
	readonly stage?: Stage;
	/**
	 * Carries this part out, throwing if it does not land. Make it repeatable:
	 * a retried release runs it again, so skip whatever already went out.
	 */
	publish(cut: Cut): Promise<void>;
}
