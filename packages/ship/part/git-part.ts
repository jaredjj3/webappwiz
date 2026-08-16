import { color } from "@webappwiz/log";
import { NodePs, type Ps } from "@webappwiz/system";
import type { Cut } from "../cut";
import { CliGit } from "../git/cli-git";
import type { Git } from "../git/git";
import type { Part, Stage } from "./part";

/** What a `GitPart` speaks git through; the repository here by default. */
export interface GitPartOptions {
	git?: Git;
	ps?: Ps;
}

/**
 * The tag naming the release, and the push that publishes it along with the
 * commit it names. Its stage puts it after every package: a tag for a version
 * a registry never got outlives the failure that caused it.
 */
export class GitPart implements Part {
	readonly packages: readonly string[] = [];
	readonly stage: Stage = "tag";

	private readonly git: Git;

	constructor(opts: GitPartOptions = {}) {
		const ps = opts.ps ?? new NodePs();
		this.git = opts.git ?? new CliGit(ps.cwd(), { ps });
	}

	async publish(cut: Cut): Promise<void> {
		// The branch goes first: a tag left behind by a push origin rejected reads
		// as a finished release, and sends the next run past this version.
		await this.git.push(await this.git.branch());
		await this.git.tag(cut.tag);
		await this.git.push(cut.tag);
		cut.log.info(`${cut.tag} ${color.green("pushed")}`);
	}
}
