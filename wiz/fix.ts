// Minimal ANSI helpers — Bun has no terminal-color built-in and this isn't worth a dep.
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

export async function fix(opts: { check: boolean }): Promise<void> {
	await biome(opts.check);
	await typecheck();
}

async function biome(check: boolean): Promise<void> {
	// --write --unsafe applies fixable lint rules (e.g. useBlockStatements); --check is read-only for CI.
	const flags = check ? [] : ["--write", "--unsafe"];
	const { exitCode } = await Bun.$`bunx biome check ${flags} .`.nothrow();
	if (exitCode === 0) {
		console.log(`biome: ${green("success")}`);
	} else {
		console.log(`biome: ${red("failed")}`);
		throw new Error("Biome check failed");
	}
}

async function typecheck(): Promise<void> {
	// One root tsconfig covers every workspace, so a single tsc run is enough here.
	const { exitCode } = await Bun.$`bunx tsc --noEmit`.nothrow();
	console.log(
		`typecheck: ${exitCode === 0 ? green("success") : red("failed")}`,
	);
	if (exitCode !== 0) {
		throw new Error("Typechecking failed");
	}
}
