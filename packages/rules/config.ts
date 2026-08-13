/** What every section of a config shares: which agent runs it, and how many
 * calls it may have in flight. Callers add their own rules and whatever else
 * their use case needs. */
export interface RunnerOptions {
	/** The model an agent run uses when the caller does not name one. */
	agent: string;
	/** Agent calls in flight at once. */
	concurrency: number;
}

/** The cheapest model that reads a rule and a file well enough to judge it.
 * Anything slower is a decision to make per project, in the config. */
export const DEFAULT_AGENT = "haiku";

/** Agent calls at once. A call is minutes of latency and no local work, so the
 * cap is about the provider's rate limits and your patience, not this machine:
 * raise it in the config when the limits allow. */
export const DEFAULT_CONCURRENCY = 4;

/**
 * Every rule id that appears more than once, which is a config that cannot be
 * reported honestly: two rules under one name means a finding cites something
 * ambiguous. Callers decide how loudly to say so.
 */
export function duplicates(ids: string[]): string[] {
	const seen = new Set<string>();
	const repeated = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) {
			repeated.add(id);
		}
		seen.add(id);
	}
	return [...repeated];
}
