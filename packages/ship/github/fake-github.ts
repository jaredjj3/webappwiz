import type { Github } from "./github";

/** Remembering every tag it was asked to release. */
export class FakeGithub implements Github {
	readonly releases: string[] = [];

	async release(tag: string): Promise<void> {
		this.releases.push(tag);
	}
}
