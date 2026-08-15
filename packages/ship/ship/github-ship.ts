import type { Github } from "../github/github";
import type { Problem } from "../problem";
import type { Release } from "../release/release";
import type { Ship } from "./ship";

/**
 * The release notes for the tag. Asking for the tag is what creates it, so
 * declaring this step last is what puts the notes after the publishes.
 */
export class GithubShip implements Ship {
	readonly packages: readonly string[] = [];

	constructor(private readonly github: Github) {}

	problems(): Promise<Problem[]> {
		return this.github.problems();
	}

	async run(release: Release): Promise<void> {
		await this.github.release(await release.tag());
	}
}
