import type { Finding } from "@webappwiz/rules";
import type { Changeset } from "./changeset";
import type { Rule } from "./rule/rule";

/** Whether a change can land on its own, and everything saying it cannot. */
export interface Decision {
	/** True when no rule found anything a person has to look at. */
	ships: boolean;
	/** Why not, in the order the rules were given. Empty when it ships. */
	reasons: Finding[];
	/** Rules whose checks escalated: an agent should read the change, and
	 * nobody has. Advisory, so an unpaid run still decides. */
	unreviewed: string[];
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
	 * Runs every rule's check. Free: what a check escalates is reported in the
	 * decision rather than sent to an agent here, so a change stopped by code
	 * never pays for one.
	 */
	check(changeset: Changeset): Decision {
		const reasons: Finding[] = [];
		const unreviewed: string[] = [];
		for (const rule of this.rules) {
			const { findings, escalate } = rule.check(changeset);
			reasons.push(...findings);
			if (escalate) {
				unreviewed.push(rule.id);
			}
		}
		return { ships: reasons.length === 0, reasons, unreviewed };
	}
}
