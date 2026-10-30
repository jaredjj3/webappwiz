import { ConsoleLogger, color, type Logger } from "webappwiz/log";
import { type Fs, NodePs, type Ps } from "webappwiz/system";
import { publishWorkflow } from "./publish-workflow";

export interface FixOptions {
	/** Report problems without writing fixes, as CI wants it. */
	check: boolean;
	/** Check only code rules, without credentials or model calls. */
	codeOnly?: boolean;
	log?: Logger;
	ps?: Ps;
	fs?: Fs;
}

/**
 * Fails when the generated publish workflow has drifted, then runs biome,
 * the type checker, then scry on what changed since main, in
 * that order. Scry leaves off each model its budget no longer covers, so a
 * spent budget narrows the check rather than fail it.
 */
export async function fix(opts: FixOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const ps = opts.ps ?? new NodePs();

	// Every step says how it went and the first failure ends the run, so the
	// verdict a person reads last is the one that stopped them.
	const step = (name: string, ok: boolean, failure: string): void => {
		log.info(`${name}: ${ok ? color.green("success") : color.red("failed")}`);
		if (!ok) {
			throw new Error(failure);
		}
	};

	// Written by a release, never here: a stale stub is a release that was not
	// committed whole, and only a check can catch that.
	const drift = await publishWorkflow(opts.fs)
		.check(ps.cwd())
		.then(
			() => undefined,
			(error: Error) => error.message,
		);
	step("publish workflow", drift === undefined, drift ?? "");

	const flags = opts.check ? [] : ["--write", "--unsafe"];
	const biome = await ps.spawn(["bunx", "biome", "check", ...flags, "."]);
	step("biome", biome.exitCode === 0, "Biome check failed");

	// One root tsconfig covers every workspace, so a single tsc run is enough here.
	const typecheck = await ps.spawn(["bunx", "tsc", "--noEmit"]);
	step("typecheck", typecheck.exitCode === 0, "Typechecking failed");

	const scry = await ps.spawn([
		"bin/wiz",
		"scry",
		"check",
		"--since",
		"main",
		"--disable-over-budget",
		...(opts.codeOnly ? ["--disable", "som", "--disable", "llm"] : []),
	]);
	step("scry", scry.exitCode === 0, "Scry check failed");
}
