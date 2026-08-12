import type { Package } from "../plan";

/**
 * The packages a release stamps and publishes. One version covers the whole
 * workspace.
 */
export interface Workspace {
	/** The directory the workspace is rooted at. */
	readonly root: string;
	/** The version every package in the workspace shares. */
	version(): Promise<string>;
	packages(): Promise<Package[]>;
	/** Stamps `version` into every package, in lockstep. */
	setVersion(version: string): Promise<void>;
}
