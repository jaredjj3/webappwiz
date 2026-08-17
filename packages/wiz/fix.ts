import { JUDGE_RULES } from "@webappwiz/cli/rules";
import { Check } from "@webappwiz/rules";
import { ConsoleLogger, color, type Logger } from "webappwiz/log";
import { type Fs, type Glob, NodePs, type Ps } from "webappwiz/system";

export interface FixOptions {
	/** Report problems without writing fixes, as CI wants it. */
	check: boolean;
	/** The rules to run; the workspace's own by default. */
	checks?: Pick<Check, "run">;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	glob?: Glob;
}

/** Runs biome, the config's checks, and the type checker, in that order. */
export async function fix(opts: FixOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const ps = opts.ps ?? new NodePs();
	const checks =
		opts.checks ??
		new Check(JUDGE_RULES.rules, {
			log,
			ps,
			fs: opts.fs,
			glob: opts.glob,
		});

	// Every step says how it went and the first failure ends the run, so the
	// verdict a person reads last is the one that stopped them.
	const step = (name: string, ok: boolean, failure: string): void => {
		log.info(`${name}: ${ok ? color.green("success") : color.red("failed")}`);
		if (!ok) {
			throw new Error(failure);
		}
	};

	const flags = opts.check ? [] : ["--write", "--unsafe"];
	const biome = await ps.spawn(["bunx", "biome", "check", ...flags, "."]);
	step("biome", biome.exitCode === 0, "Biome check failed");

	step("check", await checks.run(), "Checks failed");

	// One root tsconfig covers every workspace, so a single tsc run is enough here.
	const typecheck = await ps.spawn(["bunx", "tsc", "--noEmit"]);
	step("typecheck", typecheck.exitCode === 0, "Typechecking failed");
}
