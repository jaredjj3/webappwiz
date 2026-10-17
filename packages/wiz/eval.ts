import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import { ARBOR } from "./arbor";
import { workspaceRoot } from "./test";

export interface EvalOptions {
	/** What arbor's evals entry is given: fast selection, report, or explicit e2e, then its arguments. */
	args: string[];
	fs?: Fs;
	ps?: Ps;
}

/** Run the focused suite by default; legacy end-to-end evaluation requires `e2e`. */
export async function evalSkill(opts: EvalOptions): Promise<void> {
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	// the tree you are standing in, as `test` runs it: a worktree's skill is
	// the one to compare
	const root = await workspaceRoot(fs, ps.cwd());
	const args = opts.args.length ? opts.args : ["fast"];
	const { exitCode } = await ps.spawn(["bun", ARBOR.evals, ...args], {
		cwd: root,
	});
	if (exitCode !== 0) {
		throw new Error("The evals failed");
	}
}
