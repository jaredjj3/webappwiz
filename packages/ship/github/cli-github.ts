import { NodePs, type Ps } from "@webappwiz/sys";
import type { Github } from "./github";

/** GitHub releases, via the `gh` CLI. */
/** What a `CliGithub` spawns through; the real process by default. */
export interface CliGithubOptions {
	ps?: Ps;
}

export class CliGithub implements Github {
	private readonly ps: Ps;

	constructor(opts: CliGithubOptions = {}) {
		this.ps = opts.ps ?? new NodePs();
	}

	/** Whether gh has credentials. GH_TOKEN counts, so a server needs no login. */
	async authed(): Promise<boolean> {
		const { exitCode } = await this.ps.spawnCapture(["gh", "auth", "status"]);
		return exitCode === 0;
	}

	/** Publishes release notes for `tag`, or leaves the existing ones alone. */
	async release(tag: string): Promise<void> {
		const existing = await this.ps.spawnCapture(["gh", "release", "view", tag]);
		if (existing.exitCode === 0) {
			return;
		}
		// --generate-notes writes the notes from the commits and PRs since the
		// previous tag, so nobody has to.
		const { exitCode, stderr } = await this.ps.spawnCapture([
			"gh",
			"release",
			"create",
			tag,
			"--generate-notes",
		]);
		if (exitCode !== 0) {
			throw new Error(`gh release create ${tag}: ${stderr.trim()}`);
		}
	}
}
