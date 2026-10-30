/** A package a registry holds back until somebody approves it. */
export interface StagedPackage {
	/** What approves it, as `npm stage approve` takes it. */
	stageId: string;
	/** The page to approve it on. */
	url: string;
}

/** The package registry, as a release touches it. */
export interface Registry {
	/**
	 * Whether `publish` only stages, leaving each version unavailable until a
	 * person approves it. A release then waits for `published` to turn true
	 * before it tags.
	 */
	readonly staged?: boolean;
	published(name: string, version: string): Promise<boolean>;
	/** The version an install of `name` gets now, or `undefined` before any is out. */
	deployed(name: string): Promise<string | undefined>;
	/**
	 * Publishes the package in `dir`, logging in along the way if that is what
	 * publishing here takes. Throws if it does not go out. A registry that
	 * stages says what it staged.
	 */
	publish(dir: string): Promise<StagedPackage | undefined>;
}
