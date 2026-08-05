import { color } from "@webappwiz/log";
import { log } from "./log";

export async function fix(opts: { check: boolean }): Promise<void> {
	await biome(opts.check);
	await typecheck();
}

async function biome(check: boolean): Promise<void> {
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

async function typecheck(): Promise<void> {
	// One root tsconfig covers every workspace, so a single tsc run is enough here.
	const { exitCode } = await Bun.$`bunx tsc --noEmit`.nothrow();
	log.info(
		`typecheck: ${exitCode === 0 ? color.green("success") : color.red("failed")}`,
	);
	if (exitCode !== 0) {
		throw new Error("Typechecking failed");
	}
}
