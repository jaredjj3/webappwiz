import { resolve } from "node:path";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import { Release } from "webappwiz/ship";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";

/** Where a project declares what it ships, relative to its root. */
export const SHIP_DECLARATION = ".wiz/ship.ts";

/** Where the ship commands read from and print to; the real system by default. */
export interface ShipOptions {
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
}

/**
 * Publishes what the project's declaration names that its registries lack, at
 * the version the checkout stands at, as the generated publish workflow runs
 * it: trusted, with no tag, stamp, approval or notes.
 */
export async function publish(opts: ShipOptions = {}): Promise<void> {
	const { declared, log, fs, ps } = await load(opts);
	await declared.publish({ log, fs, ps });
}

/**
 * Has each registry trust the generated publish workflow for every package
 * the declaration names, the once-per-package setup that publishing with no
 * token or 2FA takes.
 */
export async function trust(opts: ShipOptions = {}): Promise<void> {
	const { declared, log } = await load(opts);
	await declared.trust({ log });
}

/**
 * The project's declaration, the default export of `.wiz/ship.ts`: a
 * `Release` or a promise of one.
 */
async function load(opts: ShipOptions) {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	const path = resolve(ps.cwd(), SHIP_DECLARATION);
	if (!(await fs.exists(path))) {
		throw new Error(
			`${path} not found: declare what the project ships with \`export default releases.lockstep(...)\` from "webappwiz/ship"`,
		);
	}
	const mod = (await import(path).catch((cause: unknown) => {
		throw new Error(`could not load ${path}: ${cause}`, { cause });
	})) as { default?: Release | Promise<Release> };
	const declared = await mod.default;
	if (!(declared instanceof Release)) {
		throw new Error(`${path} must export a Release by default`);
	}
	return { declared, log, fs, ps };
}
