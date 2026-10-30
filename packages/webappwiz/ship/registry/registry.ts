/** A package a registry holds back until somebody approves it. */
export interface StagedPackage {
	/** What approves it, as `npm stage approve` takes it. */
	stageId: string;
	/** The page to approve it on. */
	url: string;
}

/**
 * What a registry took from one publish. Either way it now has the version,
 * though it may not serve it yet: it is accepted, and live once installable.
 */
export interface Publication {
	/**
	 * The registry had this version already, as npm answers a retry of one it
	 * took but is still scanning, so nothing went out this time.
	 */
	readonly already?: boolean;
	/** Set when the registry holds the version until somebody approves it. */
	readonly staged?: StagedPackage;
}

/** The package registry, as a release touches it. */
export interface Registry {
	/**
	 * Whether `publish` only stages, leaving each version unavailable until a
	 * person approves it. A release then waits for `published` to turn true
	 * before it tags.
	 */
	readonly staged?: boolean;
	/**
	 * Whether the registry checks each version it accepts before serving it,
	 * as npm scans every publish for malware. A release then waits for
	 * `published` to turn true before it tags. A registry with no scan serves
	 * what it accepts at once.
	 */
	readonly scans?: boolean;
	/** Whether `version` of `name` is live: installable, not merely accepted. */
	published(name: string, version: string): Promise<boolean>;
	/** The version an install of `name` gets now, or `undefined` before any is out. */
	deployed(name: string): Promise<string | undefined>;
	/**
	 * Publishes the package in `dir`, logging in along the way if that is what
	 * publishing here takes. Throws if the registry does not take it.
	 */
	publish(dir: string): Promise<Publication>;
	/**
	 * This registry as a CI job it trusts publishes to it, with no stage and
	 * no login. Leave it off when there is no such way to publish.
	 */
	trusted?(): Registry;
	/** Where a person can see `version` of `name`, and why it is not live yet. */
	page?(name: string, version: string): string;
}
