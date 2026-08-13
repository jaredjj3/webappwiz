import type { Rule as Base } from "@webappwiz/rules";
import type { Level } from "../diagnostic";
import type { Hit } from "../hit";

/** What every rule carries, whoever ends up deciding it. */
interface Common extends Base {
	/** Glob choosing which files this rule applies to. */
	readonly files: string;
	/** How loudly a violation reports. */
	readonly level: Level;
}

/**
 * A rule a token scan settles outright. It runs locally on every `wiz fix`,
 * costs nothing, and no agent ever reads it.
 */
export interface Checked extends Common {
	readonly judgedBy: "code";
	/** Every violation in one file's text. */
	check(text: string): Hit[];
}

/**
 * A rule only an agent can decide, because applying it means reading the code
 * rather than matching it. It runs on demand, and it is billed.
 */
export interface Judged extends Common {
	readonly judgedBy: "agent";
}

/**
 * A rule whose check sees some of its cases and an agent the rest. The check
 * runs locally with the others; the agent still gets the rule, for what a
 * token scan cannot see.
 */
export interface PartlyChecked extends Common {
	readonly judgedBy: "both";
	/** The violations code alone can be sure of, which is not all of them. */
	check(text: string): Hit[];
}

/**
 * One rule of judge's rule set: what it applies to, the document a human reads
 * and an agent receives verbatim, and who decides it.
 *
 * `judgedBy` is the discriminant, so a rule cannot claim a check it does not
 * implement or hide one it does.
 */
export type Rule = Checked | Judged | PartlyChecked;

/** Whether this rule has a check to run locally. */
export const hasCheck = (rule: Rule): rule is Checked | PartlyChecked =>
	rule.judgedBy !== "agent";

/** Whether an agent still has to read this rule. */
export const needsAgent = (rule: Rule): rule is Judged | PartlyChecked =>
	rule.judgedBy !== "code";
