import type { Hit } from "./hit";

/** How loudly a violation reports. */
export type Level = "error" | "warning";

/** One file as a check reads it: the path a glob matches, and its text. */
export interface FileText {
	/** Relative to the checked directory, the way the globs are written. */
	path: string;
	text: string;
}

/** What one check concluded about one file. */
export interface Verdict {
	/** What code is sure of. Empty is a clean pass, not an abstention. */
	findings: Hit[];
	/** True when an agent should read this file against the rule's document. */
	escalate?: boolean;
}

/**
 * All the harness needs of a rule: an id findings are filed under, and the
 * markdown an agent is handed verbatim.
 *
 * This is the whole of a rule nothing runs. A document listed for a reader to
 * apply themselves, like the ones an agent consults before merging, is one of
 * these and nothing more.
 */
export interface Rule {
	/** Kebab case: what a report cites, and what a finding is filed under. */
	readonly id: string;
	/** The rule's markdown, handed to the agent verbatim. */
	readonly document: string;
}

/**
 * A rule the checker runs over files: which files it covers, how loudly it
 * reports, and code's half of the check.
 *
 * Every kind of rule is a return value rather than a type: code settles a file
 * by returning findings, an agent-judged rule returns
 * `{ findings: [], escalate: true }`, and a hybrid returns both.
 */
export interface FileRule extends Rule {
	/** Glob choosing which files this rule applies to. */
	readonly files: string;
	/** How loudly a violation reports. */
	readonly level: Level;
	/** The whole check, code's half of it: sync, pure, one file at a time. */
	check(file: FileText): Verdict;
}
