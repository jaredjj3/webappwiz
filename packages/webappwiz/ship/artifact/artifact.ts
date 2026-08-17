import type { Cut } from "../cut";

/**
 * When an artifact goes out. Everything is `build` first, because a compiler
 * failure is only free while nothing has shipped. Packages `publish` next, the
 * `tag` naming them follows, and the `notes` about the tag come last: a tag for
 * a version no registry took would outlive the failure that caused it, so the
 * order lives here rather than in anyone's declaration.
 */
export type Stage = "build" | "publish" | "tag" | "notes";

/** Every stage, in the order a release runs them. */
export const STAGES: readonly Stage[] = ["build", "publish", "tag", "notes"];

/**
 * One thing a release does: publish a package, tag the repository, write the
 * notes. Implement it to teach a release something new, and hand it to
 * `releases.lockstep` beside the artifacts that come with this package.
 */
export interface Artifact {
	/**
	 * The workspace packages this publishes, empty for an artifact that publishes
	 * none. It is what a release cross-checks against the manifest, so a
	 * declaration that drifted is caught before anything moves.
	 */
	readonly packages: readonly string[];
	/** When this runs relative to the other artifacts; `publish` when omitted. */
	readonly stage?: Stage;
	/**
	 * Carries this artifact out, throwing if it does not land. Make it repeatable:
	 * a retried release runs it again, so skip whatever already went out.
	 */
	publish(cut: Cut): Promise<void>;
	/**
	 * Tidies up after the release, run whether or not it finished. Implement it
	 * for anything `publish` leaves on disk that the repository should not keep,
	 * and expect it after a failure as readily as after a success.
	 */
	clean?(cut: Cut): Promise<void>;
}
