import { dirname } from "node:path";
import { ConsoleLogger, color, type Logger } from "@webappwiz/log";
import { type Fs, NodeFs } from "@webappwiz/system";
import { table } from "./table";

/** The directory holding the documents this package ships. Skills live there
 * flat as `<name>.skill.md`, alongside any other templates. */
export const source = `${import.meta.dirname}/templates`;

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
}

export interface AddOptions extends ProjectOptions {
	/** The skill to install, as `skills ls` names it. */
	skill: string;
}

/** What a `Skills` works through; the real ones by default. */
export interface SkillsOptions {
	log?: Logger;
	fs?: Fs;
}

/** The `skills` command group: what agent skills there are, and which of them
 * a project holds in `.agents/skills`. */
export class Skills {
	private log: Logger;
	private fs: Fs;

	constructor(opts: SkillsOptions = {}) {
		this.log = opts.log ?? new ConsoleLogger();
		this.fs = opts.fs ?? new NodeFs();
	}

	/** The skills bundled here: every `<name>.skill.md` in the source dir. */
	private async available(): Promise<string[]> {
		const names = [];
		for (const file of await this.fs.readdir(source)) {
			const name = file.match(SKILL)?.[1];
			if (name) {
				names.push(name);
			}
		}
		return names.sort();
	}

	/**
	 * What there is to install, and what the project has of it. The version a
	 * project holds is the only thing `add` and `update` cannot tell it, so
	 * that is what this is for.
	 */
	async ls(opts: ProjectOptions): Promise<void> {
		const rows = [["skill", "ships", "installed"].map(color.dim)];
		let stale = 0;
		for (const name of await this.available()) {
			const ships =
				versionOf(await this.fs.read(`${source}/${name}.skill.md`)) ?? "?";
			const installed = await this.fs
				.read(`${opts.dir}/.agents/skills/${name}/SKILL.md`)
				.then(versionOf)
				.catch((): null => null); // not installed, or not readable: same answer here
			if (installed !== null && installed !== ships) {
				stale++;
			}
			rows.push([name, ships, installed ?? "-"]);
		}

		const lines = table(rows);
		if (stale > 0) {
			lines.push("", `${stale} out of date: run \`skills update\``);
		}
		this.log.info(lines.join("\n"));
	}

	/** Adds a skill a project does not have yet. */
	async add(opts: AddOptions): Promise<void> {
		const available = await this.available();
		if (!available.includes(opts.skill)) {
			throw new Error(
				`no such skill: ${opts.skill} (have ${available.join(", ")})`,
			);
		}
		await this.copy(opts.skill, opts.dir);
	}

	/**
	 * Refreshes the skills a project already has. Which skills those are is the
	 * project's business, so this never adds one: a skill someone chose not to
	 * install should not arrive by way of an update.
	 */
	async update(opts: ProjectOptions): Promise<void> {
		const installed = await this.fs
			.readdir(`${opts.dir}/.agents/skills`)
			.catch((): string[] => []); // no .agents/skills at all is just "none installed"
		const ours = (await this.available()).filter((name) =>
			installed.includes(name),
		);
		if (ours.length === 0) {
			this.log.info(
				`no webappwiz skills in ${opts.dir}: add one with \`skills add\``,
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
		const target = `${dir}/.agents/skills/${name}/SKILL.md`;
		await this.fs.mkdir(dirname(target));
		await this.fs.write(
			target,
			await this.fs.read(`${source}/${name}.skill.md`),
		);
		this.log.info(`wrote ${target}`);
	}
}
