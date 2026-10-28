import { catalog } from "@webappwiz/scry/catalog";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import { type Bump, releases } from "webappwiz/ship";
import { type Fs, NodePs, type Ps } from "webappwiz/system";
import { Duration } from "webappwiz/time";
import { fix } from "./fix";

/**
 * Every agent skill this workspace ships, listed rather than discovered so
 * that adding one is a line here. Projects install each from the release's
 * tag with `bunx skills add`, so stamping it is what has a project's copy say
 * which release it came from; this repo's own `.agents/skills` copies are
 * symlinks to them.
 */
const SKILLS = ["skills/scry/SKILL.md", "skills/webappwiz/SKILL.md"];

/**
 * Every rule the catalog ships, stamped the same way and for the same reason:
 * a project's copy says which release it came from. The roster is the
 * catalog's own, so a rule added there is stamped without a line here.
 */
const RULES = Object.keys(catalog).map(
	(id) => `packages/scry/catalog/${id}/RULE.md`,
);

export interface ShipOptions {
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	// scry-ignore objects-over-callbacks: the platform's own prompt() is the
	// dependency here, and it is a bare function
	prompt?: (message: string) => string | null;
	/** Skip the confirmation, for a caller that has already approved the ship. */
	yes?: boolean;
	/** The environment `SPLATES_SHIP_BUMP` is read from; the process's by default. */
	env?: Record<string, string | undefined>;
}

/**
 * Releases every package in the workspace together, at one version, a
 * patch unless `SPLATES_SHIP_BUMP` asks for a minor or major. A release that died
 * is finished first, at the version it already holds.
 */
export async function ship(opts: ShipOptions = {}): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const bump = bumpOf(opts.env ?? process.env);
	const ps = opts.ps ?? new NodePs();
	const declared = releases.lockstep(
		releases.push({ ps }),
		releases.step({
			name: "Typecheck",
			deadline: Duration.mins(10),
			stage: "preflight",
			// The build compiles without checking types, so this is the only gate.
			// The suite is expected to have run before anybody ships.
			run: async () => fix({ check: true, log, ps }),
		}),
		await releases.workspace({ fs: opts.fs, ps }),
		...[...SKILLS, ...RULES].map((path) =>
			releases.skill(path, { fs: opts.fs }),
		),
	);
	await declared.release({
		bump,
		prompt: opts.prompt,
		yes: opts.yes,
		log,
		fs: opts.fs,
		ps,
	});
}

const BUMPS: readonly Bump[] = ["patch", "minor", "major"];

/** The bump `splates ship` chose, a patch when it chose none. */
function bumpOf(env: Record<string, string | undefined>): Bump {
	const value = env.SPLATES_SHIP_BUMP;
	if (value === undefined || value === "") {
		return "patch";
	}
	const bump = BUMPS.find((known) => known === value);
	if (!bump) {
		throw new Error(
			`SPLATES_SHIP_BUMP must be patch, minor or major, not "${value}"`,
		);
	}
	return bump;
}
