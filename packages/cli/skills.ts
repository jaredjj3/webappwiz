import { dirname } from "node:path";
import type { Logger } from "@webappwiz/log";
import type { Fs } from "@webappwiz/sys";
import { walk } from "./walk";

/** Skills ship inside this package, so a published copy carries them too. */
export const source = `${import.meta.dir}/skills`;

/**
 * Writes one skill into a project. The copy is a copy, not a merge: whatever is
 * there is replaced, which is what makes the version in a skill's frontmatter
 * mean anything.
 */
async function copy(
	fs: Fs,
	log: Logger,
	name: string,
	dir: string,
): Promise<void> {
	const from = `${source}/${name}`;
	for await (const file of walk(fs, from)) {
		const target = `${dir}/.agents/skills/${name}${file.slice(from.length)}`;
		await fs.mkdir(dirname(target));
		await fs.write(target, await fs.read(file));
		log.info(`wrote ${target}`);
	}
}

/** Adds a skill a project does not have yet. */
export async function add(
	opts: { skill: string; dir: string },
	log: Logger,
	fs: Fs,
): Promise<void> {
	const available = await fs.readdir(source);
	if (!available.includes(opts.skill)) {
		throw new Error(
			`no such skill: ${opts.skill} (have ${available.join(", ")})`,
		);
	}
	await copy(fs, log, opts.skill, opts.dir);
}

/**
 * Refreshes the skills a project already has. Which skills those are is the
 * project's business, so this never adds one — a skill someone chose not to
 * install should not arrive by way of an update.
 */
export async function update(
	opts: { dir: string },
	log: Logger,
	fs: Fs,
): Promise<void> {
	const installed = await fs
		.readdir(`${opts.dir}/.agents/skills`)
		.catch((): string[] => []); // no .agents/skills at all is just "none installed"
	const ours = (await fs.readdir(source)).filter((n) => installed.includes(n));
	if (ours.length === 0) {
		log.info(
			`no webappwiz skills in ${opts.dir} — add one with \`skills add\``,
		);
		return;
	}
	for (const name of ours) {
		await copy(fs, log, name, opts.dir);
	}
}
