import { ConsoleLogger, color, type Logger } from "webappwiz/log";
import { NodePs, type Ps } from "webappwiz/system";

export interface FixOptions {
	/** Report problems without writing fixes, as CI wants it. */
	check: boolean;
	log?: Logger;
	ps?: Ps;
}

/** Runs biome and the type checker, in that order. */
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

	const flags = opts.check ? [] : ["--write", "--unsafe"];
	const biome = await ps.spawn(["bunx", "biome", "check", ...flags, "."]);
	step("biome", biome.exitCode === 0, "Biome check failed");

	// One root tsconfig covers every workspace, so a single tsc run is enough here.
	const typecheck = await ps.spawn(["bunx", "tsc", "--noEmit"]);
	step("typecheck", typecheck.exitCode === 0, "Typechecking failed");
}
