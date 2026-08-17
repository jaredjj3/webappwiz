import type { Artifact, Stage } from "../artifact/artifact";
import type { Cut } from "../cut";
import type { Github } from "./github";

/**
 * The GitHub release notes for the tag. Its stage puts it after the tag,
 * which is what it writes about.
 */
export class GithubArtifact implements Artifact {
	readonly packages: readonly string[] = [];
	readonly stage: Stage = "notes";

	constructor(private readonly github: Github) {}

	async publish(cut: Cut): Promise<void> {
		await this.github.release(cut.tag);
	}
}
