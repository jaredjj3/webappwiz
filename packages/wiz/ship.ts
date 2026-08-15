import { ConsoleLogger, type Logger } from "@webappwiz/log";
import type { Check } from "@webappwiz/rules";
import { ship as release, releases } from "@webappwiz/ship";
import { type Fs, NodePs, type Ps } from "@webappwiz/system";
import { fix } from "./fix";

/** What `wiz ship` will answer to, which is every verb the library has. */
const VERBS = ["patch", "minor", "major", "resume"] as const;

type Verb = (typeof VERBS)[number];

function isVerb(value: string): value is Verb {
	return (VERBS as readonly string[]).includes(value);
}

export interface ShipOptions {
	/** How far to move the version: patch, minor, major, or resume. */
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
	if (!isVerb(opts.bump)) {
		throw new Error(
			`unknown version bump "${opts.bump}" (expected ${VERBS.join(", ")})`,
		);
	}
	// These packages publish their source, so a typecheck is the only compile
	// gate there is. Run it before anything is stamped or pushed.
	await fix({ check: true, checks: opts.checks, log, ps });

	const declared = await releases.workspace({ fs: opts.fs, ps });
	await release[opts.bump](declared, {
		prompt: opts.prompt,
		log,
		fs: opts.fs,
		ps,
	});
}
