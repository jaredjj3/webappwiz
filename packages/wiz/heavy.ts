import { homedir } from "node:os";
import type { Logger } from "webappwiz/log";
import { type Fs, HeavyJobs, type Ps } from "webappwiz/system";

/**
 * The heavy-job slots every splates on this machine takes: take one around a
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
	// Splates' own copy of this is `heavyJobsOfMachine` in its `heavy.ts`: it
	// reads the same names here rather than being imported, since splates
	// leaves this repository. `SPLATES_MACHINE_HOME` is what `splates dev
	// --slot` sets for its servers, `SPLATES_HEAVY` what a merge's `preMerge`
	// sets while it holds a slot. The `ARBOR_*` names are what splates read
	// before its rename, and `~/.arbor` links to `~/.splates` once it migrates
	// a machine; they stay as a fallback for a release.
	const env = (name: string) =>
		ps.env(`SPLATES_${name}`) ?? ps.env(`ARBOR_${name}`);
	const home =
		env("MACHINE_HOME") ??
		env("HOME") ??
		`${ps.env("HOME") ?? homedir()}/.splates`;
	const cap = Number(env("HEAVY_JOBS"));
	const held =
		ps.env("SPLATES_HEAVY") === undefined && ps.env("ARBOR_HEAVY") !== undefined
			? "ARBOR_HEAVY"
			: "SPLATES_HEAVY";
	return HeavyJobs.under(home, {
		fs,
		ps,
		log,
		cap: Number.isInteger(cap) && cap > 0 ? cap : 2,
		held,
	});
}
