import { color, type Logger } from "@webappwiz/log";

export async function fix(
	opts: { check: boolean },
	log: Logger,
): Promise<void> {
	await biome(opts.check, log);
	await typecheck(log);
}

async function biome(check: boolean, log: Logger): Promise<void> {
	// --write --unsafe applies fixable lint rules (e.g. useBlockStatements); --check is read-only for CI.
	const flags = check ? [] : ["--write", "--unsafe"];
	const { exitCode } = await Bun.$`bunx biome check ${flags} .`.nothrow();
	if (exitCode === 0) {
		log.info(`biome: ${color.green("success")}`);
	} else {
		log.info(`biome: ${color.red("failed")}`);
		throw new Error("Biome check failed");
	}
}

async function typecheck(log: Logger): Promise<void> {
	// One root tsconfig covers every workspace, so a single tsc run is enough here.
	const { exitCode } = await Bun.$`bunx tsc --noEmit`.nothrow();
	log.info(
		`typecheck: ${exitCode === 0 ? color.green("success") : color.red("failed")}`,
	);
	if (exitCode !== 0) {
		throw new Error("Typechecking failed");
	}
}
