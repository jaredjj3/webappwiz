import { ConsoleLogger, type Logger } from "@webappwiz/log";
import type { Check } from "@webappwiz/rules";
import { type Bump, releases } from "@webappwiz/ship";
import { type Fs, NodePs, type Ps } from "@webappwiz/system";
import { fix } from "./fix";

/** What `wiz ship` will answer to. A release that died is finished first. */
const BUMPS = ["patch", "minor", "major"] as const satisfies readonly Bump[];

function isBump(value: string): value is Bump {
	return (BUMPS as readonly string[]).includes(value);
}

export interface ShipOptions {
	/** How far to move the version: patch, minor, or major. */
	bump: string;
	/** The rules the gate runs; the workspace's own by default. */
	checks?: Pick<Check, "run">;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	// judge-ignore objects-over-callbacks: the platform's own prompt() is the
	// dependency here, and it is a bare function
	prompt?: (message: string) => string | null;
}

/** Releases every package in the workspace together, at one version. */
export async function ship(opts: ShipOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const ps = opts.ps ?? new NodePs();
	if (!isBump(opts.bump)) {
		throw new Error(
			`unknown version bump "${opts.bump}" (expected ${BUMPS.join(", ")})`,
		);
	}
	// These packages publish their source, so a typecheck is the only compile
	// gate there is. Run it before anything is stamped or pushed.
	await fix({ check: true, checks: opts.checks, log, ps });

	const declared = await releases.workspace({ fs: opts.fs, ps });
	await declared.release({
		bump: opts.bump,
		prompt: opts.prompt,
		log,
		fs: opts.fs,
		ps,
	});
}
