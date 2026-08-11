import type { Finding } from "./finding";

/** What a violation of a rule counts as, and what a diagnostic counts as. */
export type Level = "error" | "warning";

/** A check's finding, stamped with where it was and which rule said so. */
export interface Diagnostic extends Finding {
	path: string;
	rule: string;
	severity: Level;
}

/** A problem with a rule's own document, rather than with code. */
export interface GuideDiagnostic {
	/** The id of the rule the problem is in. */
	rule: string;
	/** 1-based line of the rule's document, when the problem has one. */
	line?: number;
	severity: Level;
	message: string;
}
