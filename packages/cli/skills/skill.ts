import { dirname } from "node:path";
import type { Logger } from "webappwiz/log";
import type { Fs } from "webappwiz/system";
import arbor from "../templates/arbor.skill.md" with { type: "text" };
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
export const bundled: Skills = { arbor, webappwiz };

export function versionOf(md: string): string | null {
	// frontmatter only, so a `version:` inside a fenced example in the body is
	// not mistaken for the real one
	const frontmatter = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
	return frontmatter.match(/^version:\s*(.+)$/m)?.[1]?.trim() ?? null;
}

/** The project a skills command works on. */
export interface ProjectOptions {
	/** Its root: the directory holding `.agents/skills`. */
	dir: string;
	log?: Logger;
	fs?: Fs;
	/** The skills on offer; the ones this package ships by default. */
	skills?: Skills;
}

/**
 * Every skill on offer, name and document together, in the order they are
 * listed and installed in.
 */
export function available(skills: Skills): Array<[string, string]> {
	return Object.entries(skills).toSorted(([left], [right]) =>
		left.localeCompare(right),
	);
}

/** What `copy` works through, once an action has resolved them. */
export interface CopyOptions {
	log: Logger;
	fs: Fs;
}

/** Installs one skill into a project. */
export async function copy(
	name: string,
	doc: string,
	dir: string,
	opts: CopyOptions,
): Promise<void> {
	// a copy, not a merge: replacing whatever is there is what makes the
	// version in a skill's frontmatter mean anything
	const target = `${dir}/.agents/skills/${name}/SKILL.md`;
	await opts.fs.mkdir(dirname(target));
	await opts.fs.write(target, doc);
	opts.log.info(`wrote ${target}`);
}
