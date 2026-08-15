import { ConsoleLogger } from "@webappwiz/log";
import { NodeFs } from "@webappwiz/system";
import { available, copy, type ProjectOptions } from "./skill";

/**
 * Refreshes the skills a project already has. Which skills those are is the
 * project's business, so this never adds one: a skill someone chose not to
 * install should not arrive by way of an update.
 */
export async function update(opts: ProjectOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const installed = await fs
		.readdir(`${opts.dir}/.agents/skills`)
		.catch((): string[] => []); // no .agents/skills at all is just "none installed"
	const ours = (await available(fs)).filter((name) => installed.includes(name));
	if (ours.length === 0) {
		log.info(`no webappwiz skills in ${opts.dir}: add one with \`skills add\``);
		return;
	}
	for (const name of ours) {
		await copy(name, opts.dir, { log, fs });
	}
}
