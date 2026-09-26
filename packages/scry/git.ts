import { isAbsolute, posix, relative } from "node:path";
import { NodePs, type Ps } from "webappwiz/system";

/** One file a change touched, and how. */
export interface ChangedFile {
	/** From the repository root. */
	path: string;
	/** The file's diff against the base, or its whole text when it is new. */
	diff: string;
}

/** What a check covers: the files a change touched, and what it measured from. */
export interface Changeset {
	/** What the change is measured from, as a report names it. */
	since: string;
	files: ChangedFile[];
}

/** What `Git` spawns through; the real process by default. */
export interface GitOptions {
	ps?: Ps;
}

/**
 * The change a check covers, as git sees it. Deleted files are left out:
 * there is nothing left in them to check.
 */
export class Git {
	private ps: Ps;

	constructor(
		/** The repository root. */
		private dir: string,
		opts: GitOptions = {},
	) {
		this.ps = opts.ps ?? new NodePs();
	}

	/**
	 * The root of the repository holding `dir`, and `paths`, given from `dir`,
	 * as `changes` wants them: from the root. Git works out where `dir` sits,
	 * so a symlink on the way (macOS's `/tmp`) does not throw it off.
	 */
	static async locate(
		dir: string,
		paths: string[],
		opts: GitOptions = {},
	): Promise<{ root: string; paths: string[] }> {
		const ps = opts.ps ?? new NodePs();
		const { exitCode, stdout, stderr } = await ps.spawnCapture([
			"git",
			"-C",
			dir,
			"rev-parse",
			"--show-toplevel",
			"--show-prefix",
		]);
		if (exitCode !== 0) {
			throw new Error(`${dir} is not in a git repository: ${stderr.trim()}`);
		}
		const [root = "", prefix = ""] = stdout.split("\n");
		return {
			root,
			paths: paths.map((path) => {
				const from = posix.normalize(
					isAbsolute(path) ? relative(root, path) : `${prefix}${path}`,
				);
				if (from === ".." || from.startsWith("../")) {
					throw new Error(`${path} is outside the repository at ${root}`);
				}
				return from.replace(/\/$/, "");
			}),
		};
	}

	/**
	 * The files changed since `ref`, committed or not. With no ref, the
	 * uncommitted work when there is any, and otherwise the branch since it
	 * left trunk, so the usual cases need no flag. `paths`, from the root,
	 * keep only the files at or under them; none keeps every file.
	 */
	async changes(ref?: string, paths: string[] = []): Promise<Changeset> {
		const pathspec = ["--", ...paths];
		const [base, since] = await this.base(ref, pathspec);
		const tracked = await this.lines(
			"diff",
			"--name-only",
			"--diff-filter=d",
			base,
			...pathspec,
		);
		const untracked = await this.lines(
			"ls-files",
			"--others",
			"--exclude-standard",
			...pathspec,
		);
		const files: ChangedFile[] = [];
		for (const path of tracked.toSorted()) {
			files.push({ path, diff: await this.out("diff", base, "--", path) });
		}
		for (const path of untracked.toSorted()) {
			// --no-index exits 1 whenever the two differ, which a new file always does
			const { stdout } = await this.git(
				"diff",
				"--no-index",
				"--",
				"/dev/null",
				path,
			);
			files.push({ path, diff: stdout });
		}
		return { since, files };
	}

	/** The commit to diff against, and what a report calls it. */
	private async base(
		ref: string | undefined,
		pathspec: string[],
	): Promise<[string, string]> {
		if (ref !== undefined) {
			return [ref, ref];
		}
		if ((await this.out("status", "--porcelain", ...pathspec)).trim() !== "") {
			return ["HEAD", "HEAD"];
		}
		const { exitCode, stdout } = await this.git(
			"symbolic-ref",
			"--short",
			"refs/remotes/origin/HEAD",
		);
		const trunk =
			exitCode === 0 ? stdout.trim().replace(/^origin\//, "") : "main";
		return [(await this.out("merge-base", "HEAD", trunk)).trim(), trunk];
	}

	private async lines(...args: string[]): Promise<string[]> {
		return (await this.out(...args)).split("\n").filter((line) => line !== "");
	}

	/** Stdout of a git command that has to succeed. */
	private async out(...args: string[]): Promise<string> {
		const { exitCode, stdout, stderr } = await this.git(...args);
		if (exitCode !== 0) {
			throw new Error(`git ${args.join(" ")}: ${stderr.trim()}`);
		}
		return stdout;
	}

	private git(...args: string[]) {
		return this.ps.spawnCapture(["git", "-C", this.dir, ...args]);
	}
}
