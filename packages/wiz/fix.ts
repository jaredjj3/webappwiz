import { color, type Logger } from "@webappwiz/log";
import type { Ps } from "@webappwiz/sys";

export async function fix(
	opts: { check: boolean },
	log: Logger,
	ps: Ps,
): Promise<void> {
	await biome(opts.check, log, ps);
	await typecheck(log, ps);
}

async function biome(check: boolean, log: Logger, ps: Ps): Promise<void> {
	const flags = check ? [] : ["--write", "--unsafe"];
	const { exitCode } = await ps.spawn([
		"bunx",
		"biome",
		"check",
		...flags,
		".",
	]);
	if (exitCode === 0) {
		log.info(`biome: ${color.green("success")}`);
	} else {
		log.info(`biome: ${color.red("failed")}`);
		throw new Error("Biome check failed");
	}
}

async function typecheck(log: Logger, ps: Ps): Promise<void> {
	// One root tsconfig covers every workspace, so a single tsc run is enough here.
	const { exitCode } = await ps.spawn(["bunx", "tsc", "--noEmit"]);
	log.info(
		`typecheck: ${exitCode === 0 ? color.green("success") : color.red("failed")}`,
	);
	if (exitCode !== 0) {
		throw new Error("Typechecking failed");
	}
}
