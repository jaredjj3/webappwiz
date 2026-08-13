import type { Rule as Base, Finding } from "@webappwiz/rules";
import type { Changeset } from "../changeset";

/** What every signoff rule carries, whoever ends up deciding it. */
type Common = Base;

/**
 * A rule code alone settles by reading the changeset. It costs nothing, so it
 * runs first: a change stopped here never pays for an agent.
 */
export interface Checked extends Common {
	readonly checkedBy: "code";
	/** Everything about this change the rule wants a person to look at. */
	check(changeset: Changeset): Finding[];
}

/**
 * A rule whose check settles some of its cases and an agent the rest. The
 * check runs with the others; the agent still gets the rule.
 */
export interface PartlyChecked extends Common {
	readonly checkedBy: "code-then-agent";
	check(changeset: Changeset): Finding[];
}

/**
 * A rule only an agent can settle, because deciding it means reading the
 * change rather than matching it.
 */
export interface Reviewed extends Common {
	readonly checkedBy: "agent";
}

/**
 * One rule of a signoff: what it looks for in a change, and who decides it.
 *
 * `checkedBy` is the discriminant, so it discriminates
 * without a rule being able to claim a check it does not implement.
 */
export type Rule = Checked | PartlyChecked | Reviewed;

/** Whether this rule has a check to run over the changeset. */
export const hasCheck = (rule: Rule): rule is Checked | PartlyChecked =>
	rule.checkedBy !== "agent";

/** Whether an agent still has to read this rule. */
export const needsAgent = (rule: Rule): rule is PartlyChecked | Reviewed =>
	rule.checkedBy !== "code";
