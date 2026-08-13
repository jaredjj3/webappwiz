import type { Rule as Judged } from "@webappwiz/rules";
import type { Level } from "../diagnostic";
import type { Hit } from "../hit";

/**
 * One rule of judge's config: the files it applies to, the document a human
 * reads and an agent receives verbatim, and the check enforcing it when code
 * alone can decide it.
 *
 * A rule with no check is judged by an agent; a `partial` check is both, the
 * check deciding the cases it can see and the agent the rest.
 */
export interface Rule extends Judged {
	/** Glob choosing which files this rule applies to. */
	readonly files: string;
	/** How loudly a violation reports. */
	readonly level: Level;
	/** Every violation in one file's text, for a rule code alone can decide. */
	check?(text: string): Hit[];
	/** True when the check decides only some of the rule's cases, so the rule
	 * still needs an agent. A full check takes the rule off the agent's plate. */
	readonly partial?: boolean;
}
