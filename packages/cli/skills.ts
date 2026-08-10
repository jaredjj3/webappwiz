import { dirname } from "node:path";
import type { Logger } from "@webappwiz/log";
import type { Fs } from "@webappwiz/sys";
import { walk } from "./walk";

/** Skills ship inside this package, so a published copy carries them too. */
export const source = `${import.meta.dir}/skills`;

/**
 * Copies the skills bundled here into a project's `.agents/skills/`. The copy
 * is a copy, not a merge: whatever is there is replaced, which is what makes
 * the version in a skill's frontmatter mean anything.
 */
export async function skills(
	opts: { dir: string; skill: string },
	log: Logger,
	fs: Fs,
): Promise<void> {
	const available = await fs.readdir(source);
	if (opts.skill !== "" && !available.includes(opts.skill)) {
		throw new Error(
			`no such skill: ${opts.skill} (have ${available.join(", ")})`,
		);
	}
	const wanted = opts.skill === "" ? available : [opts.skill];

	for (const name of wanted) {
		for await (const file of walk(fs, `${source}/${name}`)) {
			const target = `${opts.dir}/.agents/skills/${name}${file.slice(`${source}/${name}`.length)}`;
			await fs.mkdir(dirname(target));
			await fs.write(target, await fs.read(file));
			log.info(`wrote ${target}`);
		}
	}
}
