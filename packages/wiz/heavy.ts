import { homedir } from "node:os";
import type { Logger } from "webappwiz/log";
import { type Fs, HeavyJobs, type Ps } from "webappwiz/system";

/**
 * The heavy-job slots every arbor on this machine takes: take one around a
 * heavy run, so it waits its turn behind the agents' test runs and merges.
 */
export function machineHeavyJobs({
	fs,
	ps,
	log,
}: {
	fs: Fs;
	ps: Ps;
	log: Logger;
}): HeavyJobs {
	// Arbor's own copy of this is `heavyJobsOfMachine` in
	// `packages/arbor/heavy.ts`: it reads the same names here rather than
	// being imported, since arbor leaves this repository. `ARBOR_MACHINE_HOME`
	// is what `arbor dev --slot` sets for its servers, `ARBOR_HEAVY` what a
	// merge's `preMerge` sets while it holds a slot.
	const home =
		ps.env("ARBOR_MACHINE_HOME") ??
		ps.env("ARBOR_HOME") ??
		`${ps.env("HOME") ?? homedir()}/.arbor`;
	const cap = Number(ps.env("ARBOR_HEAVY_JOBS"));
	return HeavyJobs.under(home, {
		fs,
		ps,
		log,
		cap: Number.isInteger(cap) && cap > 0 ? cap : 2,
		held: "ARBOR_HEAVY",
	});
}
