import type { Github } from "./github";

/** Logged in, and remembering every tag it was asked to release. */
export class FakeGithub implements Github {
	loggedIn = true;
	readonly releases: string[] = [];

	async authed(): Promise<boolean> {
		return this.loggedIn;
	}

	async release(tag: string): Promise<void> {
		this.releases.push(tag);
	}
}
