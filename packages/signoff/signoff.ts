import type { Finding } from "@webappwiz/rules";
import type { Changeset } from "./changeset";
import { hasCheck, type Rule } from "./rule/rule";

/** Whether a change can land on its own, and everything saying it cannot. */
export interface Decision {
	/** True when no rule found anything a person has to look at. */
	ships: boolean;
	/** Why not, in the order the rules were given. Empty when it ships. */
	reasons: Finding[];
}

/**
 * Decides whether a change needs a person before it lands.
 *
 * The rules are the caller's, passed in: there is no default set, because a
 * gate nobody chose is a gate nobody trusts. One reason is enough to stop a
 * change, so a rule reporting nothing is a rule with no objection rather than
 * a rule voting to ship.
 */
export class Signoff {
	constructor(private readonly rules: Rule[]) {}

	/**
	 * Runs every rule code alone can settle. Free, and it runs first: a change
	 * stopped here never pays for an agent.
	 */
	check(changeset: Changeset): Decision {
		const reasons = this.rules
			.filter(hasCheck)
			.flatMap((rule) => rule.check(changeset));
		return { ships: reasons.length === 0, reasons };
	}
}
