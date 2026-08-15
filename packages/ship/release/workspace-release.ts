import { ConsoleLogger, type Logger } from "@webappwiz/log";
import type { Git } from "../git/git";
import type { Package } from "../workspace/workspace";
import type { Release } from "./release";

/** Where a `WorkspaceRelease` speaks; the console by default. */
export interface WorkspaceReleaseOptions {
	log?: Logger;
}

/** A release of one workspace, tagged and pushed through its repository. */
export class WorkspaceRelease implements Release {
	readonly log: Logger;

	private pushed?: Promise<string>;

	constructor(
		readonly version: string,
		private readonly packages: Package[],
		private readonly git: Git,
		opts: WorkspaceReleaseOptions = {},
	) {
		this.log = opts.log ?? new ConsoleLogger();
	}

	dir(name: string): string | undefined {
		return this.packages.find((pkg) => pkg.name === name)?.dir;
	}

	/** Tags and pushes once, however many steps ask. */
	tag(): Promise<string> {
		this.pushed ??= this.push();
		return this.pushed;
	}

	private async push(): Promise<string> {
		const tag = `v${this.version}`;
		await this.git.tag(tag);
		await this.git.push(await this.git.branch());
		await this.git.push(tag);
		return tag;
	}
}
