import type { Logger } from "webappwiz/log";
import type { Fs } from "webappwiz/system";
import type { Layout } from "../documents";
import arbor from "../templates/arbor.skill.md" with { type: "text" };
import rulesReview from "../templates/rules-review.skill.md" with {
	type: "text",
};
import webappwiz from "../templates/webappwiz.skill.md" with { type: "text" };

/** Skill name to the document a project installs under that name. */
export type Skills = Record<string, string>;

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
	arbor,
	"rules-review": rulesReview,
	webappwiz,
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
}
