import type { Cut } from "../cut";
import type { Part, Stage } from "../part/part";
import type { Github } from "./github";

/**
 * The GitHub release notes for the tag. Its stage puts it after the tag,
 * which is what it writes about.
 */
export class GithubPart implements Part {
	readonly packages: readonly string[] = [];
	readonly stage: Stage = "notes";

	constructor(private readonly github: Github) {}

	async publish(cut: Cut): Promise<void> {
		await this.github.release(cut.tag);
	}
}
