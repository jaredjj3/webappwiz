import { dirname } from "node:path";
import type { Logger } from "@webappwiz/log";
import type { Fs } from "@webappwiz/sys";
import { walk } from "./walk";

/** Skills ship inside this package, so a published copy carries them too. */
export const source = `${import.meta.dir}/skills`;

/**
 * The release a skill came from. Read out of the frontmatter rather than the
 * body, so a `version:` inside a fenced example is not mistaken for the real
 * one. Null when the file has neither.
 */
export function versionOf(md: string): string | null {
	const frontmatter = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
	return frontmatter.match(/^version:\s*(.+)$/m)?.[1]?.trim() ?? null;
}

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

/**
 * What there is to install, and what the project has of it. The version a
 * project holds is the only thing `add` and `update` cannot tell it, so that is
 * what this is for.
 */
export async function ls(
	opts: { dir: string },
	log: Logger,
	fs: Fs,
): Promise<void> {
	const rows = [["SKILL", "SHIPS", "INSTALLED"]];
	let stale = 0;
	for (const name of await fs.readdir(source)) {
		const ships = versionOf(await fs.read(`${source}/${name}/SKILL.md`)) ?? "?";
		const installed = await fs
			.read(`${opts.dir}/.agents/skills/${name}/SKILL.md`)
			.then(versionOf)
			.catch((): null => null); // not installed, or not readable — same answer here
		if (installed !== null && installed !== ships) {
			stale++;
		}
		rows.push([name, ships, installed ?? "-"]);
	}

	const widths = rows[0]?.map((_, i) =>
		Math.max(...rows.map((r) => (r[i] ?? "").length)),
	);
	const lines = rows.map((r) =>
		r
			.map((cell, i) => cell.padEnd(widths?.[i] ?? 0))
			.join("  ")
			.trimEnd(),
	);
	if (stale > 0) {
		lines.push("", `${stale} out of date — run \`skills update\``);
	}
	log.info(lines.join("\n"));
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
