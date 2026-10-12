import { availableParallelism } from "node:os";
import { dirname } from "node:path";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";

export interface TestOptions {
	/** One package to test, by name; empty runs the whole workspace. */
	package: string;
	/** Test files run at once; half the cores when left out. */
	workers?: number;
	fs?: Fs;
	ps?: Ps;
}

export async function test(opts: TestOptions): Promise<void> {
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
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
	// since most still share a fixture built in beforeEach. Half the cores, not
	// bun's one per core: several agents test at once, and a worker per core
	// each starves their git-spawning suites past the 5s timeout. Three
	// overlapping runs on 16 cores failed 20 to 30 tests each at 16 workers and
	// 0 to 2 at 8, finishing sooner too; one run alone is about 1.5s slower.
	// Even so, those suites run many times slower under load than alone, so
	// each test gets 30s rather than 5s.
	const workers =
		opts.workers ?? Math.max(1, Math.floor(availableParallelism() / 2));
	const { exitCode } = await ps.spawn(
		[
			"bun",
			"test",
			"--pass-with-no-tests",
			`--parallel=${workers}`,
			"--timeout",
			"30000",
			...filter,
		],
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
