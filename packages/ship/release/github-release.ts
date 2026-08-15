import type { Cut } from "../cut";
import type { Github } from "../github/github";
import type { Release } from "./release";

/**
 * The GitHub release notes for the tag. Declare it after `releases.git()`,
 * which is what puts the tag there for it to write about.
 */
export class GithubRelease implements Release {
	readonly packages: readonly string[] = [];

	constructor(private readonly github: Github) {}

	async publish(cut: Cut): Promise<void> {
		await this.github.release(cut.tag);
	}
}
