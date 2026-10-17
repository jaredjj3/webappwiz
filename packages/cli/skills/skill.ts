import { ConsoleLogger, type Logger } from "webappwiz/log";
import { ProjectSkills } from "webappwiz/skills";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import { version as RELEASE } from "../package.json";

/**
 * The repository webappwiz's skills come from: each release is a tag in it,
 * and each skill a `skills/<name>/SKILL.md` there.
 */
export const SOURCE = "jaredjj3/webappwiz";

/**
 * The skills webappwiz ships, each a `skills/<name>/SKILL.md` in its
 * repository, which projects install from a release's tag through
 * `bunx skills add`. Listed rather than discovered, so adding a skill is a
 * line here.
 */
export const SHIPPED = ["scry", "webappwiz"];

/** A skill this package used to ship under another name. */
export interface Retired {
	/** The skill it became, which `update` installs in its place. */
	now: string;
	/**
	 * Matches every description it shipped with, so `update` replaces our copy
	 * and leaves alone a project's own skill that happens to share the name.
	 */
	description: RegExp;
}

/** Old skill name to what became of it. */
export const retired: Record<string, Retired> = {
	review: {
		now: "scry",
		description: /^Review a change against the .*\.wiz\/rules/,
	},
};

/** The project a skills command works on. */
export interface ProjectOptions {
	/** Its root: the directory holding `.agents/skills`. */
	dir: string;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	/** The release to install skills from; this package's by default. */
	version?: string;
	/** The skills on offer; the ones webappwiz ships by default. */
	skills?: string[];
	/** The names skills used to go by; the ones this package retired by default. */
	retired?: Record<string, Retired>;
}

/** What a skills command works with, its defaults filled in. */
export function project(opts: ProjectOptions): {
	skills: ProjectSkills;
	log: Logger;
	fs: Fs;
	version: string;
	shipped: string[];
} {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	return {
		skills: new ProjectSkills(opts.dir, { fs, ps, log, source: SOURCE }),
		log,
		fs,
		version: opts.version ?? RELEASE,
		shipped: opts.skills ?? SHIPPED,
	};
}
