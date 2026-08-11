import type { Ps } from "@webappwiz/sys";

/**
 * The files git says are new or changed in `dir` since `ref`, named the way a
 * rule's glob is: relative to `dir`, so a run over one package of a repo sees
 * its own paths rather than the repo's.
 *
 * Deletions are left out. A violation quotes the offending line from disk, so a
 * file that is gone has nothing to read and nothing to report.
 */
export async function changed(
	ps: Ps,
	dir: string,
	ref: string,
): Promise<Set<string>> {
	const files = new Set<string>();
	for (const argv of [
		// against the ref rather than between two commits, so work in the tree
		// counts whether or not it has been staged or committed yet
		["diff", "--name-only", "--diff-filter=d", "--relative", ref],
		// and the files git has never been told about, which no diff reaches
		["ls-files", "--others", "--exclude-standard"],
	]) {
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
		for (const line of stdout.split("\n")) {
			if (line !== "") {
				files.add(line);
			}
		}
	}
	return files;
}
