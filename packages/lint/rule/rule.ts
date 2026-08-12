import type { Level } from "../diagnostic";
import type { Finding } from "../finding";

/**
 * One rule of a guide: the files it applies to, the document a human reads and
 * an analysis agent receives verbatim, and the check enforcing it when a
 * linter can decide it.
 *
 * A rule with no check is judged by an agent; a `partial` check is both, the
 * linter deciding the cases it can see and the agent the rest.
 */
export interface Rule {
	/** Kebab case: what a report cites and `lint show` takes. */
	readonly id: string;
	/** Glob choosing which files this rule applies to. */
	readonly files: string;
	/** How loudly a violation reports. */
	readonly level: Level;
	/** The rule's markdown, verbatim. */
	readonly document: string;
	/** Every violation in one file's text, for a rule a linter can decide. */
	check?(text: string): Finding[];
	/**
	 * True when this text could break the rule, for an agent rule that would
	 * otherwise pay to read files with nothing in them to find: `files` picks by
	 * path, this picks by content.
	 *
	 * Soundness runs the other way to `check`. A check finding nothing proves
	 * nothing, but false here has to mean no violation is possible, or the run
	 * skips one and says nothing. Match loosely: over-matching costs tokens,
	 * under-matching costs the finding.
	 */
	applies?(text: string): boolean;
	/** True when the check decides only some of the rule's cases, so the rule
	 * still needs an agent. A full check takes the rule off the agent's plate. */
	readonly partial?: boolean;
}
