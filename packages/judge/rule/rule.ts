import type { Rule as Core, Verdict as CoreVerdict } from "@webappwiz/rules";
import type { Level } from "../diagnostic";
import type { Hit } from "../hit";

/** One file as judge checks it: the path a glob matches, and its text. */
export interface FileText {
	/** Relative to the judged directory, the way the globs are written. */
	path: string;
	text: string;
}

/** What one check concluded about one file. */
export type Verdict = CoreVerdict<Hit>;

/**
 * One rule of judge's rule set. The unit is a file: `check` reads one file's
 * text and returns what code is sure of, escalating the file when an agent
 * should read it against the rule's document too.
 */
export interface Rule extends Core<FileText, Hit> {
	/** Glob choosing which files this rule applies to. */
	readonly files: string;
	/** How loudly a violation reports. */
	readonly level: Level;
}
