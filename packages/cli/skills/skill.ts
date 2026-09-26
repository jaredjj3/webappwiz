import type { Logger } from "webappwiz/log";
import type { Fs } from "webappwiz/system";
import type { Bundle, Layout } from "../documents";
import arbor from "../templates/arbor.skill.md" with { type: "text" };
import scry from "../templates/scry.skill.md" with { type: "text" };
import webappwiz from "../templates/webappwiz.skill.md" with { type: "text" };

/** Skill name to what a project installs under that name. */
export type Skills = Record<string, Bundle>;

/**
 * The skills this package ships.
 *
 * They are imported rather than read out of a directory so they travel inside
 * the build: what publishes is the compiled JavaScript, and a document sitting
 * beside the source would not be part of it. Naming each one also means adding
 * a skill is a line here rather than a file that a directory listing may or may
 * not happen to pick up.
 */
export const bundled: Skills = {
	arbor: { "SKILL.md": arbor },
	scry: { "SKILL.md": scry },
	webappwiz: { "SKILL.md": webappwiz },
};

/** A skill this package used to ship under another name. */
export interface Retired {
	/** The skill it became, which `update` installs in its place. */
	now: string;
	/**
	 * Matches every description it shipped with, so `update` replaces our copy
	 * and leaves alone a project's own skill that happens to share the name.
	 */
	description: RegExp;
	/** What else the project has to change now that the skill is renamed. */
	migrate?: string;
}

/** Old skill name to what became of it. */
export const retired: Record<string, Retired> = {
	review: {
		now: "scry",
		description: /^Review a change against the .*\.wiz\/rules/,
		migrate:
			"rename every rule-ignore comment to scry-ignore; scry honors the old spelling until then",
	},
};

/** Where a project keeps its skills, the way every agent harness reads them. */
export const SKILLS: Layout = {
	root: ".agents/skills",
	file: "SKILL.md",
	noun: "skill",
};

/** The project a skills command works on. */
export interface ProjectOptions {
	/** Its root: the directory holding `.agents/skills`. */
	dir: string;
	log?: Logger;
	fs?: Fs;
	/** The skills on offer; the ones this package ships by default. */
	skills?: Skills;
	/** The names skills used to go by; the ones this package retired by default. */
	retired?: Record<string, Retired>;
}
