import { NodePs, type Ps } from "webappwiz/system";

/** One file a review covers, named the way a rule's glob is: relative to the
 * reviewed directory. */
export interface ChangedFile {
	path: string;
	/** True for a file git has never been told about, which no diff reaches. */
	added: boolean;
}

/** What `changed` spawns git through; the real process by default. */
export interface ChangedOptions {
	ps?: Ps;
}

/**
 * The files git says are new or changed in `dir` since `ref`, committed or
 * not, plus the ones git has never been told about. Deletions are left out: a
 * file that is gone has nothing to read and nothing to report.
 */
export async function changed(
	dir: string,
	ref: string,
	opts: ChangedOptions = {},
): Promise<ChangedFile[]> {
	const ps = opts.ps ?? new NodePs();
	const files = new Map<string, ChangedFile>();
	// against the ref rather than between two commits, so work in the tree
	// counts whether or not it has been staged or committed yet
	for (const path of await git(ps, dir, [
		"diff",
		"--name-only",
		"--diff-filter=d",
		"--relative",
		ref,
	])) {
		files.set(path, { path, added: false });
	}
	for (const path of await git(ps, dir, [
		"ls-files",
		"--others",
		"--exclude-standard",
	])) {
		if (!files.has(path)) {
			files.set(path, { path, added: true });
		}
	}
	return [...files.values()].toSorted((left, right) =>
		left.path.localeCompare(right.path),
	);
}

/** One git command's non-empty output lines, or the reason it would not answer. */
async function git(ps: Ps, dir: string, argv: string[]): Promise<string[]> {
	const { exitCode, stdout, stderr } = await ps.spawnCapture([
		"git",
		"-C",
		dir,
		...argv,
	]);
	if (exitCode !== 0) {
		throw new Error(
			`git ${argv[0]} failed in ${dir}: ${stderr.trim() || `exit ${exitCode}`}`,
		);
	}
	return stdout.split("\n").filter((line) => line !== "");
}
