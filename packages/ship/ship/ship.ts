import type { Plan } from "../plan";
import type { Bump } from "../version";

/**
 * Releases every package in a workspace together, at one version.
 *
 * Ask `plan` what a release would do, show that to whoever is deciding, then
 * hand the plan back to `run`.
 */
export interface Ship {
	plan(type: Bump): Promise<Plan>;
	/**
	 * Carries out `plan`, having checked that it still holds. Run it again after
	 * a failure: everything that already landed is skipped, so a second run
	 * finishes the release rather than starting a new one.
	 */
	run(plan: Plan): Promise<void>;
}
