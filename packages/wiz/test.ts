import { dirname } from "node:path";
import { type Fs, NodeFs, NodePs, type Ps } from "@webappwiz/sys";

export interface TestOptions {
	/** One package to test, by name; empty runs the whole workspace. */
	package: string;
}

export async function test(
	opts: TestOptions,
	fs?: Fs,
	ps?: Ps,
): Promise<void> {
	const files = fs ?? new NodeFs();
	const proc = ps ?? new NodePs();
	// the tree you are standing in, not the one `wiz` was installed from: a git
	// worktree has its own copy of both, and testing the other one passes while
	// saying nothing about your work
	const root = await workspaceRoot(files, proc.cwd());

	// one run from the root, so bun reports every failure together instead of
	// scrolling the early packages' errors off the top
	const filter: string[] = [];
	if (opts.package !== "") {
		if (!(await files.exists(`${root}/packages/${opts.package}`))) {
			throw new Error(`no such package: ${opts.package}`);
		}
		filter.push(`packages/${opts.package}/`);
	}

	// a worker per file; suites opt into within-file concurrency themselves,
	// since most still share a fixture built in beforeEach
	const { exitCode } = await proc.spawn(
		["bun", "test", "--pass-with-no-tests", "--parallel", ...filter],
		{ cwd: root },
	);
	if (exitCode !== 0) {
		throw new Error("Tests failed");
	}
}

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
