/** The GitHub releases a release publishes. */
export interface Github {
	/** Whether there are credentials. A token counts, so a server needs no login. */
	authed(): Promise<boolean>;
	/** Publishes release notes for `tag`, or leaves the existing ones alone. */
	release(tag: string): Promise<void>;
}
