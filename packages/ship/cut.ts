import { ConsoleLogger, type Logger } from "@webappwiz/log";
import type { Package } from "./workspace/workspace";

/** Where a `Cut` speaks; the console by default. */
export interface CutOptions {
	log?: Logger;
}

/**
 * The release under way, as one artifact of it sees it: the version everything
 * goes out at, the tag that names it, and where the packages sit. By the time
 * an artifact is handed one, every package is stamped and committed.
 */
export class Cut {
	/** The tag naming this release, such as `v1.2.4`. */
	readonly tag: string;
	/** Where an artifact says what it did. */
	readonly log: Logger;

	constructor(
		/** The version every package in this release goes out at. */
		readonly version: string,
		private readonly packages: Package[],
		opts: CutOptions = {},
	) {
		this.tag = `v${version}`;
		this.log = opts.log ?? new ConsoleLogger();
	}

	/** Where the named package's package.json sits, when the workspace has it. */
	dir(name: string): string | undefined {
		return this.packages.find((pkg) => pkg.name === name)?.dir;
	}
}
