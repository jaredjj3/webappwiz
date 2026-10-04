import type { Decider } from "./decider";
import type { SourceFile } from "./source-file";

/**
 * A rule's check: it reads one file and says where the file breaks the rule.
 * A rule's `rule.ts` default-exports a class implementing it. Which files it
 * reads, its threshold, `scry-ignore` comments and the report are not its
 * concern: its `RULE.md` and the check that runs it handle those.
 */
export interface Rule {
	check(file: SourceFile): Promise<Finding[]>;
}

/** One place a file breaks a rule, as the rule sees it. */
export interface Finding {
	/** From 1. */
	line: number;
	message: string;
	/**
	 * How sure whatever decided it was, from 0 to 1: 1 when code decided it,
	 * a decider's answer when one did. Under the rule's threshold, the check
	 * drops it.
	 */
	confidence: number;
	/** The question a decider answered, when one decided it. */
	decidedBy?: string;
}

/**
 * What every rule is built with. A rule's constructor takes this and keeps
 * what it uses; a rule that only reads code takes nothing. A tool that costs
 * something to use, like a model, costs nothing until a rule uses it.
 */
export interface Tools {
	/** Answers yes-or-no questions about code, with the probability of yes. */
	decider: Decider;
}

/** What a rule's `rule.ts` default-exports. */
export type RuleClass = new (tools: Tools) => Rule;
