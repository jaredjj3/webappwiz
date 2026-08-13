import type { Level } from "../diagnostic";
import type { Finding } from "../finding";

/**
 * One rule of a config: the files it applies to, the document a human reads
 * and an agent receives verbatim, and the check enforcing it when code alone
 * can decide it.
 *
 * A rule with no check is judged by an agent; a `partial` check is both, the
 * check deciding the cases it can see and the agent the rest.
 */
export interface Rule {
	/** Kebab case: what a report cites and `rules show` takes. */
	readonly id: string;
	/** Glob choosing which files this rule applies to. */
	readonly files: string;
	/** How loudly a violation reports. */
	readonly level: Level;
	/** The rule's markdown, verbatim. */
	readonly document: string;
	/** Every violation in one file's text, for a rule code alone can decide. */
	check?(text: string): Finding[];
	/** True when the check decides only some of the rule's cases, so the rule
	 * still needs an agent. A full check takes the rule off the agent's plate. */
	readonly partial?: boolean;
}
