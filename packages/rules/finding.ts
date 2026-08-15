/**
 * One rule broken in one place, as the harness hands it back.
 *
 * What a finding means is the caller's to decide. The harness reports what an
 * agent said and that the rule it named is real; whether that is worth failing
 * a build, asking a human or printing in grey is a question this type does not
 * answer.
 */
export interface Finding {
	/** The rule the finding is filed under, checked against the review's rules. */
	rule: string;
	/** How this code breaks the rule. Never what to do about it. */
	message: string;
	/** Where the finding is, when it is somewhere in particular. A rule about a
	 * change as a whole reports none of these. */
	file?: string;
	/** 1-based. */
	line?: number;
	/** 1-based. */
	column?: number;
}
