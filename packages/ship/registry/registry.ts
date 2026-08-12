/** The package registry, as a release touches it. */
export interface Registry {
	/** Whether there are credentials. A token counts, so a server needs no login. */
	authed(): Promise<boolean>;
	published(name: string, version: string): Promise<boolean>;
	/** Publishes the package in `dir`. */
	publish(dir: string): Promise<void>;
}
