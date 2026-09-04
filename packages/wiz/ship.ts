import { catalog } from "@webappwiz/rules/catalog";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import { releases } from "webappwiz/ship";
import { type Fs, NodePs, type Ps } from "webappwiz/system";
import { fix } from "./fix";

/**
 * Every agent skill this workspace ships, listed rather than discovered so
 * that adding one is a line here. Each is the document `@webappwiz/cli`
 * bundles; this repo's own `.agents/skills` copies are symlinks to them, so
 * stamping the template is what keeps `skills ls` from calling them stale the
 * moment a release lands.
 */
const SKILLS = [
	"packages/cli/templates/arbor.skill.md",
	"packages/cli/templates/rules-review.skill.md",
	"packages/cli/templates/webappwiz.skill.md",
];

/**
 * Every rule the catalog ships, stamped the same way and for the same reason:
 * a project's copy says which release it came from. The roster is the
 * catalog's own, so a rule added there is stamped without a line here.
 */
const RULES = Object.keys(catalog).map(
	(id) => `packages/rules/catalog/${id}/RULE.md`,
);

export interface ShipOptions {
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	// rule-ignore objects-over-callbacks: the platform's own prompt() is the
	// dependency here, and it is a bare function
	prompt?: (message: string) => string | null;
}

/**
 * Releases every package in the workspace together, at one version, always a
 * patch. One version covers them all here, so anything larger would carry the
 * whole workspace on the strength of one package's change. A release that died
 * is finished first, at the version it already holds.
 */
export async function ship(opts: ShipOptions = {}): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const ps = opts.ps ?? new NodePs();
	// These packages publish their source, so a typecheck is the only compile
	// gate there is: run it before anything is stamped or pushed. The suite is
	// not run here; whoever ships is expected to have run it already.
	await fix({ check: true, log, ps });

	const declared = releases.lockstep(
		await releases.workspace({ fs: opts.fs, ps }),
		...[...SKILLS, ...RULES].map((path) =>
			releases.skill(path, { fs: opts.fs }),
		),
	);
	await declared.release({
		bump: "patch",
		prompt: opts.prompt,
		log,
		fs: opts.fs,
		ps,
	});
}
