import type { Finding } from "./finding";

/** What one check concluded about one unit. */
export interface Verdict<F = Finding> {
	/** What code is sure of. Empty is a clean pass, not an abstention. */
	findings: F[];
	/** True when an agent should read this unit against the rule's document. */
	escalate?: boolean;
}

/**
 * One rule: the document a human reads and an agent receives verbatim, and
 * the code half of its check.
 *
 * A unit is whatever one check reads and one finding cites: a file for a
 * linter, a changeset for a gate. The library never looks inside it; only
 * rules do. Every kind of rule is a return value rather than a type: code
 * settles a unit by returning findings, an agent-judged rule returns
 * `{ findings: [], escalate: true }`, and a hybrid returns both.
 */
export interface Rule<Unit, F = Finding> {
	/** Kebab case: what a report cites, and what a finding is filed under. */
	readonly id: string;
	/** The rule's markdown, handed to the agent verbatim. */
	readonly document: string;
	/** The whole check, code's half of it: sync, pure, one unit at a time. */
	check(unit: Unit): Verdict<F>;
}
