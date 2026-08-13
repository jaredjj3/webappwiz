/**
 * What the harness needs of a rule: a name to file findings under, and the
 * prose an agent reads.
 *
 * Everything else about a rule belongs to whoever runs it. A rule that code
 * alone can decide, the files it applies to, how loudly a violation reports:
 * all of that varies by caller, and none of it is the harness's business.
 * Callers extend this with what they need.
 */
export interface Rule {
	/** Kebab case: what a report cites, and what a finding is filed under. */
	readonly id: string;
	/** The rule's markdown, handed to the agent verbatim. */
	readonly document: string;
}
