/** The package registry, as a release touches it. */
export interface Registry {
	published(name: string, version: string): Promise<boolean>;
	/**
	 * Publishes the package in `dir`, logging in along the way if that is what
	 * publishing here takes. Throws if it does not go out.
	 */
	publish(dir: string): Promise<void>;
}
