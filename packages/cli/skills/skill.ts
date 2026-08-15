import { dirname } from "node:path";
import type { Logger } from "@webappwiz/log";
import type { Fs } from "@webappwiz/system";

/** The directory holding the documents this package ships. Skills live there
 * flat as `<name>.skill.md`, alongside any other templates. */
export const source = `${import.meta.dirname}/../templates`;

const SKILL = /^(.+)\.skill\.md$/;

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
}

/** The skills bundled here: every `<name>.skill.md` in the source dir. */
export async function available(fs: Fs): Promise<string[]> {
	const names = [];
	for (const file of await fs.readdir(source)) {
		const name = file.match(SKILL)?.[1];
		if (name) {
			names.push(name);
		}
	}
	return names.sort();
}

/** What `copy` works through, once an action has resolved them. */
export interface CopyOptions {
	log: Logger;
	fs: Fs;
}

/** Installs one bundled skill into a project. */
export async function copy(
	name: string,
	dir: string,
	opts: CopyOptions,
): Promise<void> {
	// a copy, not a merge: replacing whatever is there is what makes the
	// version in a skill's frontmatter mean anything
	const target = `${dir}/.agents/skills/${name}/SKILL.md`;
	await opts.fs.mkdir(dirname(target));
	await opts.fs.write(target, await opts.fs.read(`${source}/${name}.skill.md`));
	opts.log.info(`wrote ${target}`);
}
