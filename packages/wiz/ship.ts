import type { Check } from "@webappwiz/rules";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import { type Bump, releases } from "webappwiz/ship";
import { type Fs, NodePs, type Ps } from "webappwiz/system";
import { fix } from "./fix";
import { test } from "./test";

/** What `wiz ship` will answer to. A release that died is finished first. */
const BUMPS = ["patch", "minor"] as const satisfies readonly Bump[];

function isBump(value: string): value is Bump {
	return (BUMPS as readonly string[]).includes(value);
}

export interface ShipOptions {
	/** How far to move the version: patch or minor. Major is refused here. */
	bump: string;
	/** The rules the gate runs; the workspace's own by default. */
	checks?: Pick<Check, "run">;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	// rule-ignore objects-over-callbacks: the platform's own prompt() is the
	// dependency here, and it is a bare function
	prompt?: (message: string) => string | null;
}

/** Releases every package in the workspace together, at one version. */
export async function ship(opts: ShipOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const ps = opts.ps ?? new NodePs();
	// A policy of this workspace, not of `webappwiz/ship`: other repos release
	// one package and mean it when they say major. Here one version covers them
	// all, so the refusal belongs to the command rather than the library.
	if (opts.bump === "major") {
		throw new Error(
			"major would leave 0.x: one version covers every package here, so a break in one carries all of them to 1.0.0 and promises a stability the rest never earned. Ship minor instead, and delete this check when the whole workspace is ready to mean it.",
		);
	}
	if (!isBump(opts.bump)) {
		throw new Error(
			`unknown version bump "${opts.bump}" (expected ${BUMPS.join(", ")})`,
		);
	}
	// These packages publish their source, so a typecheck is the only compile
	// gate there is. Run it before anything is stamped or pushed, and the tests
	// after it: the cheap gate should be the one that fails first.
	await fix({ check: true, checks: opts.checks, log, ps });
	await test({ package: "", fs: opts.fs, ps });

	const declared = await releases.workspace({ fs: opts.fs, ps });
	await declared.release({
		bump: opts.bump,
		prompt: opts.prompt,
		log,
		fs: opts.fs,
		ps,
	});
}
