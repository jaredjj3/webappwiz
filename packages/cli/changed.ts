import { NodePs, type Ps } from "@webappwiz/sys";

/**
 * The files git says are new or changed in `dir` since `ref`, named the way a
 * rule's glob is: relative to `dir`, so a run over one package of a repo sees
 * its own paths rather than the repo's.
 *
 * Deletions are left out. A violation quotes the offending line from disk, so a
 * file that is gone has nothing to read and nothing to report.
 */
export async function changed(
	dir: string,
	ref: string,
	ps?: Ps,
): Promise<Set<string>> {
	const proc = ps ?? new NodePs();
	const files = new Set<string>();
	for (const argv of [
		// against the ref rather than between two commits, so work in the tree
		// counts whether or not it has been staged or committed yet
		["diff", "--name-only", "--diff-filter=d", "--relative", ref],
		// and the files git has never been told about, which no diff reaches
		["ls-files", "--others", "--exclude-standard"],
	]) {
		for (const line of (await git(proc, dir, argv)).split("\n")) {
			if (line !== "") {
				files.add(line);
			}
		}
	}
	return files;
}

/**
 * The change itself, as a patch: everything in `dir` that differs from `ref`,
 * committed or not, and the paths of the files git has never been told about,
 * which no diff reaches.
 *
 * The new files are named rather than shown because a reader of this patch is
 * an agent with the working directory in front of it, and it can open them.
 */
export async function diff(
	dir: string,
	ref: string,
	ps?: Ps,
): Promise<{ patch: string; added: string[] }> {
	const proc = ps ?? new NodePs();
	const patch = await git(proc, dir, ["diff", "--relative", ref]);
	const added = (
		await git(proc, dir, ["ls-files", "--others", "--exclude-standard"])
	)
		.split("\n")
		.filter((line) => line !== "");
	return { patch: patch.trim(), added };
}

/** One git command, or the reason it would not answer. */
async function git(ps: Ps, dir: string, argv: string[]): Promise<string> {
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
	return stdout;
}
