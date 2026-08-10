import { dirname } from "node:path";
import type { Logger } from "@webappwiz/log";
import type { Fs } from "@webappwiz/sys";
import { table } from "./table";
import { walk } from "./walk";

/** The directory holding the skills this package ships. */
export const source = `${import.meta.dir}/skills`;

/** The release a skill came from. Null when the file does not carry one. */
export function versionOf(md: string): string | null {
	// frontmatter only, so a `version:` inside a fenced example in the body is
	// not mistaken for the real one
	const frontmatter = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
	return frontmatter.match(/^version:\s*(.+)$/m)?.[1]?.trim() ?? null;
}

/** The `skills` command group: what agent skills there are, and which of them
 * a project holds in `.agents/skills`. */
export class Skills {
	constructor(
		private log: Logger,
		private fs: Fs,
	) {}

	/**
	 * What there is to install, and what the project has of it. The version a
	 * project holds is the only thing `add` and `update` cannot tell it, so
	 * that is what this is for.
	 */
	async ls(opts: { dir: string }): Promise<void> {
		const rows = [["SKILL", "SHIPS", "INSTALLED"]];
		let stale = 0;
		for (const name of await this.fs.readdir(source)) {
			const ships =
				versionOf(await this.fs.read(`${source}/${name}/SKILL.md`)) ?? "?";
			const installed = await this.fs
				.read(`${opts.dir}/.agents/skills/${name}/SKILL.md`)
				.then(versionOf)
				.catch((): null => null); // not installed, or not readable — same answer here
			if (installed !== null && installed !== ships) {
				stale++;
			}
			rows.push([name, ships, installed ?? "-"]);
		}

		const lines = table(rows);
		if (stale > 0) {
			lines.push("", `${stale} out of date — run \`skills update\``);
		}
		this.log.info(lines.join("\n"));
	}

	/** Adds a skill a project does not have yet. */
	async add(opts: { skill: string; dir: string }): Promise<void> {
		const available = await this.fs.readdir(source);
		if (!available.includes(opts.skill)) {
			throw new Error(
				`no such skill: ${opts.skill} (have ${available.join(", ")})`,
			);
		}
		await this.copy(opts.skill, opts.dir);
	}

	/**
	 * Refreshes the skills a project already has. Which skills those are is the
	 * project's business, so this never adds one — a skill someone chose not to
	 * install should not arrive by way of an update.
	 */
	async update(opts: { dir: string }): Promise<void> {
		const installed = await this.fs
			.readdir(`${opts.dir}/.agents/skills`)
			.catch((): string[] => []); // no .agents/skills at all is just "none installed"
		const ours = (await this.fs.readdir(source)).filter((n) =>
			installed.includes(n),
		);
		if (ours.length === 0) {
			this.log.info(
				`no webappwiz skills in ${opts.dir} — add one with \`skills add\``,
			);
			return;
		}
		for (const name of ours) {
			await this.copy(name, opts.dir);
		}
	}

	private async copy(name: string, dir: string): Promise<void> {
		// a copy, not a merge: replacing whatever is there is what makes the
		// version in a skill's frontmatter mean anything
		const from = `${source}/${name}`;
		for await (const file of walk(this.fs, from)) {
			const target = `${dir}/.agents/skills/${name}${file.slice(from.length)}`;
			await this.fs.mkdir(dirname(target));
			await this.fs.write(target, await this.fs.read(file));
			this.log.info(`wrote ${target}`);
		}
	}
}
