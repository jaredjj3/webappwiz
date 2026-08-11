import { dirname } from "node:path";
import type { Fs, Ps } from "@webappwiz/sys";

export async function test(
	opts: { package: string },
	fs: Fs,
	ps: Ps,
): Promise<void> {
	// the tree you are standing in, not the one `wiz` was installed from: a git
	// worktree has its own copy of both, and testing the other one passes while
	// saying nothing about your work
	const root = await workspaceRoot(fs, ps.cwd());

	// one run from the root, so bun reports every failure together instead of
	// scrolling the early packages' errors off the top
	const filter: string[] = [];
	if (opts.package !== "") {
		if (!(await fs.exists(`${root}/packages/${opts.package}`))) {
			throw new Error(`no such package: ${opts.package}`);
		}
		filter.push(`packages/${opts.package}/`);
	}

	// a worker per file; suites opt into within-file concurrency themselves,
	// since most still share a fixture built in beforeEach
	const { exitCode } = await ps.spawn(
		["bun", "test", "--pass-with-no-tests", "--parallel", ...filter],
		{ cwd: root },
	);
	if (exitCode !== 0) {
		throw new Error("Tests failed");
	}
}

/**
 * The nearest directory at or above `from` whose package.json declares
 * workspaces, or `from` itself when there is none.
 */
async function workspaceRoot(fs: Fs, from: string): Promise<string> {
	for (let dir = from; ; dir = dirname(dir)) {
		let pkg: { workspaces?: unknown } = {};
		try {
			pkg = JSON.parse(await fs.read(`${dir}/package.json`));
		} catch {
			// no package.json here, or one no parser would take: keep climbing
		}
		if (pkg.workspaces !== undefined) {
			return dir;
		}
		if (dirname(dir) === dir) {
			return from;
		}
	}
}
