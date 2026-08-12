import type { Ps } from "@webappwiz/sys";
import type { Git } from "./git";

/** Speaks git by spawning the CLI. */
export class CliGit implements Git {
	constructor(
		private readonly ps: Ps,
		private readonly root: string,
	) {}

	async clean(): Promise<boolean> {
		return (await this.out("status", "--porcelain")) === "";
	}

	branch(): Promise<string> {
		return this.out("rev-parse", "--abbrev-ref", "HEAD");
	}

	/** Where releases go out from. */
	async defaultBranch(): Promise<string> {
		const head = await this.run(
			"symbolic-ref",
			"--short",
			"refs/remotes/origin/HEAD",
		);
		// A clone that never fetched origin's HEAD has no ref to read, and a
		// wrong guess only ever costs a branch problem the caller can see.
		return head.exitCode === 0
			? head.stdout.trim().replace(/^origin\//, "")
			: "main";
	}

	/** The subject line of the commit at HEAD, which says whether it is a release. */
	headSubject(): Promise<string> {
		return this.out("log", "-1", "--format=%s");
	}

	async hasTag(tag: string): Promise<boolean> {
		const { exitCode } = await this.run(
			"rev-parse",
			"--verify",
			"--quiet",
			`refs/tags/${tag}`,
		);
		return exitCode === 0;
	}

	/** Commits every tracked change. A clean tree is already committed, so it passes. */
	async commitAll(message: string): Promise<void> {
		if (await this.clean()) {
			return;
		}
		await this.out("commit", "--all", "--message", message);
	}

	async tag(tag: string): Promise<void> {
		if (await this.hasTag(tag)) {
			return;
		}
		await this.out("tag", tag);
	}

	async push(ref: string): Promise<void> {
		await this.out("push", "origin", ref);
	}

	private run(...args: string[]) {
		return this.ps.spawnCapture(["git", "-C", this.root, ...args]);
	}

	private async out(...args: string[]): Promise<string> {
		const { exitCode, stdout, stderr } = await this.run(...args);
		if (exitCode !== 0) {
			throw new Error(
				`git ${args.join(" ")}: ${stderr.trim() || stdout.trim()}`,
			);
		}
		return stdout.trim();
	}
}
