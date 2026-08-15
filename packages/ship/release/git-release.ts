import { color } from "@webappwiz/log";
import { NodePs, type Ps } from "@webappwiz/system";
import type { Cut } from "../cut";
import { CliGit } from "../git/cli-git";
import type { Git } from "../git/git";
import type { Release } from "./release";

/** What a `GitRelease` speaks git through; the repository here by default. */
export interface GitReleaseOptions {
	git?: Git;
	ps?: Ps;
}

/**
 * The tag naming the release, and the push that publishes it along with the
 * commit it names. Declare it after the packages it tags: a tag for a version
 * a registry never got outlives the failure that caused it.
 */
export class GitRelease implements Release {
	readonly packages: readonly string[] = [];

	private readonly git: Git;

	constructor(opts: GitReleaseOptions = {}) {
		const ps = opts.ps ?? new NodePs();
		this.git = opts.git ?? new CliGit(ps.cwd(), { ps });
	}

	async publish(cut: Cut): Promise<void> {
		await this.git.tag(cut.tag);
		await this.git.push(await this.git.branch());
		await this.git.push(cut.tag);
		cut.log.info(`${cut.tag} ${color.green("pushed")}`);
	}
}
