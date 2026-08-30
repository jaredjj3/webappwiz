import type { FileRule } from "./rule";

/** What every section of a config shares: which agent runs it, and how many
 * calls it may have in flight. Callers add their own rules and whatever else
 * their use case needs. */
export interface RunnerOptions {
	/** The model an agent run uses when the caller does not name one. */
	agent: string;
	/** Agent calls in flight at once. */
	concurrency: number;
}

/** The model that reads a rule and a file well enough to judge it without
 * second-guessing. Anything else is a decision to make per project, in the
 * config. */
export const DEFAULT_AGENT = "sonnet";

/** Agent calls at once. A call is minutes of latency and no local work, so the
 * cap is about the provider's rate limits and your patience, not this machine:
 * raise it in the config when the limits allow. */
export const DEFAULT_CONCURRENCY = 8;

/** The rules a run checks and the two knobs it has. There is no config file
 * and no implicit set: this is a constant a caller writes and passes in. */
export interface RuleSet extends RunnerOptions {
	// Each rule owns its glob, its level and its document, so TypeScript's job
	// here is only composition: the rules are a typed array, and spreading
	// shared rule sets stays statically checked.
	rules: FileRule[];
}

/** A rule set as its author writes it, before the defaults are filled in. */
export interface RuleSetInput {
	rules: FileRule[];
	agent?: string;
	concurrency?: number;
}

export const defineRules = ({
	rules,
	agent = DEFAULT_AGENT,
	concurrency = DEFAULT_CONCURRENCY,
}: RuleSetInput): RuleSet => ({ rules, agent, concurrency });
