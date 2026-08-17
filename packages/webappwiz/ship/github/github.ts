/** The GitHub releases a release publishes. */
export interface Github {
	/**
	 * Publishes release notes for `tag`, or leaves the existing ones alone,
	 * logging in along the way if that is what it takes.
	 */
	release(tag: string): Promise<void>;
}
