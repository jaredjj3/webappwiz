/** The package registry, as a release touches it. */
export interface Registry {
	published(name: string, version: string): Promise<boolean>;
	/** The version an install of `name` gets now, or `undefined` before any is out. */
	deployed(name: string): Promise<string | undefined>;
	/** Whether an install can resolve the version now, rather than only list it. */
	available?(name: string, version: string): Promise<boolean>;
	/**
	 * Publishes the package in `dir`, logging in along the way if that is what
	 * publishing here takes. Throws if it does not go out.
	 */
	publish(dir: string): Promise<void>;
}
