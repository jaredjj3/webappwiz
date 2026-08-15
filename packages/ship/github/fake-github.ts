import type { Problem } from "../plan";
import type { Github } from "./github";

/** The problem a `FakeGithub` reports when `loggedIn` is off. */
export const GITHUB_AUTH: Problem = {
	kind: "github-auth",
	message: "not logged in to GitHub",
	remedy: ["github", "login"],
};

/** Logged in, and remembering every tag it was asked to release. */
export class FakeGithub implements Github {
	loggedIn = true;
	readonly releases: string[] = [];

	async problems(): Promise<Problem[]> {
		return this.loggedIn ? [] : [GITHUB_AUTH];
	}

	async release(tag: string): Promise<void> {
		this.releases.push(tag);
	}
}
