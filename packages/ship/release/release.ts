import type { Logger } from "@webappwiz/log";

/**
 * The release under way, as one step of it sees it: the version everything
 * goes out at, where the packages sit, and the tag.
 */
export interface Release {
	/** The version every package in this release goes out at. */
	readonly version: string;
	/** Where the named package's package.json sits, when the workspace has it. */
	dir(name: string): string | undefined;
	/**
	 * The tag for this release, created and pushed the first time it is asked
	 * for. Asking is what makes it, so the tag can only appear once the steps
	 * ahead of it have published: no tag outlives a publish that never happened.
	 */
	tag(): Promise<string>;
	/** Where a step says what it did. */
	readonly log: Logger;
}
