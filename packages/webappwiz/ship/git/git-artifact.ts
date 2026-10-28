import { color } from "webappwiz/log";
import { NodePs, type Ps } from "webappwiz/system";
import { Duration } from "webappwiz/time";
import type { Artifact, Stage } from "../artifact/artifact";
import type { Cut } from "../cut";
import type { Step } from "../step";
import { CliGit } from "./cli-git";
import type { Git } from "./git";

/** What a `GitArtifact` speaks git through; the repository here by default. */
export interface GitArtifactOptions {
	git?: Git;
	ps?: Ps;
}

/** Pushes the release commit and tag after every package has published. */
export class GitArtifact implements Artifact {
	readonly packages: readonly string[] = [];
	readonly stage: Stage = "tag";

	private readonly git: Git;

	constructor(opts: GitArtifactOptions = {}) {
		const ps = opts.ps ?? new NodePs();
		this.git = opts.git ?? new CliGit(ps.cwd(), { ps });
	}

	steps(cut: Cut): readonly Step[] {
		return [
			{
				name: "Push branch",
				deadline: Duration.mins(2),
				stage: "tag",
				run: () => this.pushBranch(),
			},
			{
				name: `Tag ${cut.tag}`,
				deadline: Duration.secs(30),
				stage: "tag",
				run: async () => this.git.tag(cut.tag),
			},
			{
				name: `Push ${cut.tag}`,
				deadline: Duration.mins(2),
				stage: "tag",
				run: async () => {
					await this.git.push(cut.tag);
					cut.log.info(`${cut.tag} ${color.green("pushed")}`);
				},
			},
		];
	}

	async publish(cut: Cut): Promise<void> {
		await this.pushBranch();
		await this.git.tag(cut.tag);
		await this.git.push(cut.tag);
		cut.log.info(`${cut.tag} ${color.green("pushed")}`);
	}

	private async pushBranch(): Promise<void> {
		// The branch goes first: a tag left behind by a push origin rejected reads
		// as a finished release, and sends the next run past this version.
		await this.git.push(await this.git.branch());
	}
}
