import { NodePs, type Ps } from "webappwiz/system";
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

	/**
	 * Publishes release notes for `tag`, or leaves the existing ones alone,
	 * asking for a login first if gh has nobody.
	 */
	async release(tag: string): Promise<void> {
		await this.login();
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

	/** Runs `gh auth login` unless somebody is already logged in. GH_TOKEN counts. */
	private async login(): Promise<void> {
		if ((await this.ps.spawnCapture(["gh", "auth", "status"])).exitCode === 0) {
			return;
		}
		// `gh auth login` reads from a human. CI is where there is none, and where
		// it would sit waiting rather than failing, so say what to set instead.
		if (this.ps.env("CI") !== undefined) {
			throw new Error("not logged in to GitHub: set GH_TOKEN");
		}
		const { exitCode } = await this.ps.spawn(["gh", "auth", "login"]);
		if (exitCode !== 0) {
			throw new Error("gh auth login failed");
		}
	}
}
