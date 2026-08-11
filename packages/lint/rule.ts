/** What a violation of a rule counts as, and what a diagnostic counts as. */
export type Level = "error" | "warning";

/**
 * One deterministic check. Implement this interface to write your own rule,
 * and share a set the way any linter does: export an array of rules from a
 * package.
 */
export interface Rule {
	/** What a diagnostic cites, and what a `lint-ignore` comment names. */
	id: string;
	/** Glob choosing which files the rule applies to. */
	files: string;
	level: Level;
	check(text: string): Finding[];
}

/** A problem a rule found, before the linter stamps file and severity on it. */
export interface Finding {
	/** 1-based. */
	line: number;
	/** 1-based. */
	column: number;
	message: string;
}

export interface Diagnostic extends Finding {
	path: string;
	rule: string;
	severity: Level;
}
